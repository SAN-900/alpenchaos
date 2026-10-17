import { injectFaults, type SlotResult } from "@alpenchaos/fault-injection";
import {
  createWorld, createWorldDispatch, WORLD_START,
  type NetworkState, type WorldState,
} from "@alpenchaos/network-simulator";
import { Engine, type Snapshot } from "@alpenchaos/simulation-core";
import type { Protocol, TraceEntry } from "@alpenchaos/shared";
import { planAction } from "./actions";
import { makeConfig, newGameState } from "./config";
import { canAfford, spend } from "./energy";
import { scoreStep } from "./scoring";
import type { Action, ActResult, GameConfig, GameState, LoggedAction, Role } from "./types";

export type SessionOptions = {
  net: NetworkState;
  protocols: Protocol<any>[];
  /** Protocol that scores the match, e.g. "ag". Its "<name>:block" trace entries feed tx analysis. */
  primary: string;
  /** Read slot results for the primary protocol out of the world state. */
  result: (w: WorldState) => (slot: number) => SlotResult;
  seed: number;
  config?: Partial<GameConfig>;
};

export type SessionSnapshot = { engine: Snapshot<WorldState>; game: GameState };

/**
 * One match. The session is the only thing that drains the engine trace
 * (advance() returns the entries for the UI), and it only moves in whole sim
 * steps, so a match is a pure function of (seed, config, action log).
 */
export class GameSession {
  readonly engine: Engine<WorldState>;
  game: GameState;
  private readonly primary: string;
  private readonly result: SessionOptions["result"];

  constructor(o: SessionOptions) {
    this.primary = o.primary;
    this.result = o.result;
    this.game = newGameState(makeConfig(o.config));
    this.engine = new Engine<WorldState>(createWorld(o.net, o.protocols), createWorldDispatch(o.protocols), o.seed);
    this.engine.schedule(0, "world", WORLD_START);
  }

  get now(): number {
    return this.engine.now;
  }

  /** Run whole steps up to `to` (stops early if the match ends). Returns trace entries for the UI. */
  advance(to: number): TraceEntry[] {
    const out: TraceEntry[] = [];
    const { stepMs } = this.game.cfg;
    while (!this.game.over && this.engine.now + stepMs <= to) {
      const t = this.engine.now + stepMs;
      const r = this.engine.runUntil(t);
      if (!r.reachedTarget) throw new Error("event storm: engine hit its per-step event cap");
      const entries = this.engine.trace.drain();
      for (const e of entries) {
        if (e.kind === `${this.primary}:block`) {
          this.game.blocks.push({ slot: e.slot as number, leader: e.leader as number, time: e.time });
        }
      }
      if (this.game.blocks.length > 300) this.game.blocks.splice(0, this.game.blocks.length - 300);
      scoreStep(this.game, this.result(this.engine.state), t);
      out.push(...entries);
    }
    return out;
  }

  /** Apply a player action at the current sim time. */
  act(role: Role, action: Action): ActResult {
    if (this.game.over) return { ok: false, reason: "match is over" };
    const now = this.engine.now;
    const plan = planAction(this.engine.state.net, this.game, role, action, now);
    if (!plan.ok) return plan;
    const p = this.game.players[role];
    if (!canAfford(p, this.game.cfg, now, plan.cost)) return { ok: false, reason: "not enough energy" };

    spend(p, this.game.cfg, now, plan.cost);
    injectFaults(this.engine, plan.script);
    if (plan.tx) this.game.txs.push({ spec: plan.tx, scored: false });
    this.game.actions.push({ t: now, role, action });
    this.game.feed.push({ t: now, text: plan.feed });
    return { ok: true, cost: plan.cost };
  }

  snapshot(): SessionSnapshot {
    return { engine: this.engine.snapshot(), game: structuredClone(this.game) };
  }

  restore(s: SessionSnapshot): void {
    this.engine.restore(s.engine);
    this.game = structuredClone(s.game);
  }
}

/** Rebuild a match from its action log. The log's times must lie on step boundaries (act() guarantees it). */
export function replayMatch(make: () => GameSession, log: readonly LoggedAction[], to: number): GameSession {
  const s = make();
  for (const a of [...log].sort((x, y) => x.t - y.t)) {
    s.advance(a.t);
    s.act(a.role, a.action);
  }
  s.advance(to);
  return s;
}
