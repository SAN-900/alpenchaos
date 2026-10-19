import { analyzeTx, type BlockRecord, type TxOutcome } from "@alpenchaos/fault-injection";
import { leaderForSlot, type WorldState } from "@alpenchaos/network-simulator";
import { slotStatus, type AlpenglowState, type GlobalSlot } from "@alpenchaos/protocol-alpenglow";
import { legacyStatus, type TowerBftState } from "@alpenchaos/protocol-legacy";
import {
  agResult,
  createScenarioEngine,
  slotMsOf,
  tbResult,
  type Scenario,
  type ScenarioSim,
} from "@alpenchaos/scenarios";
import type { TraceEntry } from "@alpenchaos/shared";

/** Slots shown in each lane. 40 x 400 ms = 16 s, enough to watch legacy catch up. */
export const LANE_SLOTS = 40;
/** Never ask the engine for more than this much simulated time in one go. */
const CHUNK_MS = 500;
const MAX_EVENTS_PER_RUN = 250_000;

export type Proto = "ag" | "tb";
export type CellState = "pending" | "finalized" | "skipped";

export type Cell = {
  slot: number;
  leader: number;
  state: CellState;
  /** A leader actually built a block for this slot (a skipped slot with a block is a "ghost bank"). */
  hasBlock: boolean;
  path?: "fast" | "slow";
  latencyMs?: number;
  /** Simulated time the slot was decided. */
  at?: number;
};

export type LaneStats = {
  finalized: number;
  skipped: number;
  fast: number;
  slow: number;
  medianMs: number | null;
  lastMs: number | null;
};

export type Lane = { cells: Cell[]; stats: LaneStats };

export type ValidatorView = {
  id: string;
  stakePct: number;
  region: number;
  up: boolean;
  /** 0 is the main partition group. */
  group: number;
  extraDelayMs: number;
};

/** A message in flight, for the network view. */
export type Dot = { from: number; to: number; sentAt: number; arriveAt: number; proto: Proto; kind: string };

export type TimelineEvent = {
  at: number;
  kind: "annotation" | "fault";
  title: string;
  text?: string;
  concept?: string;
};

export type TxView = { id: string; sentAt: number; ag: TxOutcome; tb: TxOutcome };

export type Frame = {
  now: number;
  slot: number;
  leader: number;
  done: boolean;
  ag: Lane;
  tb: Lane;
  validators: ValidatorView[];
  dots: Dot[];
  /** Annotations and faults whose time has come, oldest first. */
  events: TimelineEvent[];
  txs: TxView[];
};

/** Sorted-insert median tracker. */
class Latencies {
  private xs: number[] = [];
  last: number | null = null;
  add(ms: number): void {
    this.last = ms;
    let lo = 0;
    let hi = this.xs.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.xs[mid]! < ms) lo = mid + 1;
      else hi = mid;
    }
    this.xs.splice(lo, 0, ms);
  }
  get count(): number {
    return this.xs.length;
  }
  get median(): number | null {
    const n = this.xs.length;
    if (n === 0) return null;
    return n % 2 ? this.xs[n >> 1]! : Math.round((this.xs[n / 2 - 1]! + this.xs[n / 2]!) / 2);
  }
}

/**
 * Wraps the deterministic engine for the browser: advance simulated time,
 * collect what the views need (decided slots, in-flight messages, tx fates),
 * and hand out an immutable-ish Frame. Pure TypeScript, no React, so it is
 * unit-tested in Node.
 *
 * Same scenario => same run, always. That is what makes `seek` possible
 * without storing snapshots: going backwards just re-simulates from zero.
 */
export type DriverOptions = {
  /**
   * Collect in-flight messages for the network view. Turning this off also stops the engine
   * from tracing every send (~99% of all trace entries), which is about 23% less CPU.
   * Results are identical either way: tracing never touches the random stream.
   */
  dots?: boolean;
};

export class SimDriver {
  readonly slotMs: number;
  readonly durationMs: number;

  private sim!: ScenarioSim;
  private blocks!: Record<Proto, Map<number, BlockRecord>>;
  private lat!: Record<Proto, Latencies>;
  private paths!: { fast: number; slow: number };
  private skipped!: Record<Proto, number>;
  private sends!: Dot[];
  private timeline!: TimelineEvent[];
  private cached: Frame | null = null;

  private readonly dots: boolean;

  constructor(readonly scenario: Scenario, opts: DriverOptions = {}) {
    this.dots = opts.dots ?? true;
    this.slotMs = slotMsOf(scenario);
    this.durationMs = scenario.durationMs;
    this.reset();
  }

  get now(): number {
    return this.sim.engine.now;
  }
  get done(): boolean {
    return this.now >= this.durationMs;
  }

  /** Back to t = 0. */
  reset(): void {
    this.sim = createScenarioEngine(this.scenario, { traceSends: this.dots });
    this.blocks = { ag: new Map(), tb: new Map() };
    this.lat = { ag: new Latencies(), tb: new Latencies() };
    this.paths = { fast: 0, slow: 0 };
    this.skipped = { ag: 0, tb: 0 };
    this.sends = [];
    this.cached = null;

    const fromFaults: TimelineEvent[] = this.sim.script.map((f) => ({ at: f.at, kind: "fault", title: f.label ?? f.kind }));
    const fromNotes: TimelineEvent[] = this.scenario.annotations.map((a) => ({
      at: a.at,
      kind: "annotation",
      title: a.title,
      text: a.text,
      ...(a.concept ? { concept: a.concept } : {}),
    }));
    this.timeline = [...fromFaults, ...fromNotes].sort((a, b) => a.at - b.at);
  }

  /** Run forward to simulated time `t` (clamped to the scenario's duration). */
  advanceTo(t: number): void {
    const target = Math.min(Math.floor(t), this.durationMs);
    const { engine } = this.sim;
    if (target <= engine.now) return;
    this.cached = null;

    let guard = 0;
    while (engine.now < target && guard++ < 10_000) {
      const step = Math.min(target, engine.now + CHUNK_MS);
      engine.runUntil(step, MAX_EVENTS_PER_RUN);
      this.ingest(engine.trace.drain());
    }
  }

  /** Jump to any time. Backwards means replaying from the start. */
  seek(t: number): void {
    const target = Math.max(0, Math.min(Math.floor(t), this.durationMs));
    if (target < this.now) this.reset();
    this.advanceTo(target);
  }

  private ingest(entries: TraceEntry[]): void {
    const now = this.sim.engine.now;
    for (const e of entries) {
      switch (e.kind) {
        case "ag:block":
        case "tb:block": {
          const proto = e.kind === "ag:block" ? "ag" : "tb";
          this.blocks[proto].set(e.slot as number, { slot: e.slot as number, leader: e.leader as number, time: e.time });
          break;
        }
        case "ag:finalized":
          this.lat.ag.add(e.latencyMs as number);
          if (e.path === "fast") this.paths.fast++;
          else this.paths.slow++;
          break;
        case "tb:finalized":
          this.lat.tb.add(e.latencyMs as number);
          break;
        case "ag:skipped":
          this.skipped.ag++;
          break;
        case "tb:skipped":
          this.skipped.tb++;
          break;
        case "net:send": {
          const kind = e.msgKind as string;
          const from = e.from as number;
          const to = e.to as number;
          // Blocks are rare and tell the story: keep all. Votes are ~99% of traffic: keep 1 in 8.
          if (kind.endsWith(":block") || (from * 7 + to * 13 + e.time) % 8 === 0) {
            this.sends.push({ from, to, sentAt: e.time, arriveAt: e.arrive as number, proto: kind.startsWith("ag:") ? "ag" : "tb", kind });
          }
          break;
        }
      }
    }
    // Messages that have already landed are invisible: drop them so the buffer stays small.
    if (this.sends.length > 0) this.sends = this.sends.filter((d) => d.arriveAt > now);
  }

  private lane(proto: Proto, from: number, to: number): Lane {
    const world = this.sim.engine.state as WorldState;
    const status = proto === "ag" ? (s: number) => slotStatus(world.protocols["ag"] as AlpenglowState, s) : (s: number) => legacyStatus(world.protocols["tb"] as TowerBftState, s);
    const cells: Cell[] = [];
    for (let slot = from; slot <= to; slot++) {
      const g = status(slot);
      const cell: Cell = {
        slot,
        leader: leaderForSlot(world.net, slot),
        state: g ? g.status : "pending",
        hasBlock: this.blocks[proto].has(slot),
      };
      if (g) {
        cell.latencyMs = g.latencyMs;
        cell.at = g.at;
        // only Alpenglow slots have a fast/slow path
        const path = proto === "ag" ? (g as GlobalSlot).path : undefined;
        if (path) cell.path = path;
      }
      cells.push(cell);
    }
    const l = this.lat[proto];
    return {
      cells,
      stats: {
        finalized: l.count,
        skipped: this.skipped[proto],
        fast: proto === "ag" ? this.paths.fast : 0,
        slow: proto === "ag" ? this.paths.slow : 0,
        medianMs: l.median,
        lastMs: l.last,
      },
    };
  }

  /** Everything the views draw, for the current instant. Cached until time moves. */
  frame(): Frame {
    if (this.cached) return this.cached;
    const { engine } = this.sim;
    const world = engine.state as WorldState;
    const now = engine.now;
    const slot = Math.floor(now / this.slotMs);
    const first = Math.max(0, slot - LANE_SLOTS + 1);
    const cfg = { slotMs: this.slotMs, ...this.scenario.txConfig };
    const ag = agResult(world);
    const tb = tbResult(world);
    const blocks = (p: Proto) => [...this.blocks[p].values()];

    const f: Frame = {
      now,
      slot,
      leader: leaderForSlot(world.net, slot),
      done: this.done,
      ag: this.lane("ag", first, slot),
      tb: this.lane("tb", first, slot),
      validators: world.net.validators.map((v, i) => ({
        id: v.id,
        stakePct: Math.round((v.stake / world.net.totalStake) * 1000) / 10,
        region: v.region,
        up: v.up,
        group: world.net.group[i] ?? 0,
        extraDelayMs: world.net.extraDelay[i] ?? 0,
      })),
      dots: this.sends.filter((d) => d.sentAt <= now && now < d.arriveAt),
      events: this.timeline.filter((e) => e.at <= now),
      txs: this.scenario.txs.map((tx) => ({
        id: tx.id,
        sentAt: tx.sentAt,
        ag: analyzeTx(tx, blocks("ag"), ag, now, cfg),
        tb: analyzeTx(tx, blocks("tb"), tb, now, cfg),
      })),
    };
    this.cached = f;
    return f;
  }
}
