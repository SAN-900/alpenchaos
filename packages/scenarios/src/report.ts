import { analyzeTx, blocksFromTrace, type TxOutcome } from "@alpenchaos/fault-injection";
import { slotStatus, type AlpenglowState } from "@alpenchaos/protocol-alpenglow";
import { legacyStatus, type TowerBftState } from "@alpenchaos/protocol-legacy";
import { agResult, createScenarioEngine, slotMsOf, tbResult } from "./build";
import type { Scenario } from "./types";

export type LaneStats = {
  finalized: number;
  skipped: number;
  /** Past the settle margin but still undecided. */
  pending: number;
  fast: number;
  slow: number;
  medianMs: number | null;
  p95Ms: number | null;
  maxMs: number | null;
};

export type ScenarioReport = {
  id: string;
  untilMs: number;
  slotsEvaluated: number;
  ag: LaneStats;
  tb: LaneStats;
  /** Longest run of consecutive slots with no Alpenglow result, in ms of slot time. */
  agLongestGapMs: number;
  txs: { id: string; ag: TxOutcome; tb: TxOutcome }[];
};

const pct = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]! : null);

function lane(slots: number, get: (s: number) => { status: "finalized" | "skipped"; latencyMs: number; path?: "fast" | "slow" } | undefined): LaneStats {
  const lat: number[] = [];
  const out: LaneStats = { finalized: 0, skipped: 0, pending: 0, fast: 0, slow: 0, medianMs: null, p95Ms: null, maxMs: null };
  for (let s = 0; s < slots; s++) {
    const g = get(s);
    if (!g) out.pending++;
    else if (g.status === "skipped") out.skipped++;
    else {
      out.finalized++;
      lat.push(g.latencyMs);
      if (g.path === "fast") out.fast++;
      if (g.path === "slow") out.slow++;
    }
  }
  lat.sort((a, b) => a - b);
  out.medianMs = pct(lat, 0.5);
  out.p95Ms = pct(lat, 0.95);
  out.maxMs = lat.length ? lat[lat.length - 1]! : null;
  return out;
}

/**
 * Run a scenario to completion, headless, and summarize both protocols.
 * Used by tests, the server (leaderboards, replay cards) and the picker
 * thumbnails. `settleMs` keeps the newest slots out of the stats, since they
 * haven't had time to decide yet (legacy needs ~13s, so use a larger margin
 * for the legacy lane if you want a fair comparison).
 */
export function runScenario(s: Scenario, opts: { untilMs?: number; settleMs?: number } = {}): ScenarioReport {
  const untilMs = opts.untilMs ?? s.durationMs;
  const slotMs = slotMsOf(s);
  const { engine } = createScenarioEngine(s, { traceSends: false });
  engine.runUntil(untilMs);

  const ag = engine.state.protocols["ag"] as AlpenglowState;
  const tb = engine.state.protocols["tb"] as TowerBftState;
  const slots = Math.max(0, Math.floor((untilMs - (opts.settleMs ?? 1000)) / slotMs));

  const agLane = lane(slots, (n) => slotStatus(ag, n));
  const tbLane = lane(slots, (n) => legacyStatus(tb, n));

  let gap = 0;
  let longest = 0;
  for (let n = 0; n < slots; n++) {
    gap = slotStatus(ag, n) ? 0 : gap + 1;
    longest = Math.max(longest, gap);
  }

  const agBlocks = blocksFromTrace(engine.trace.entries, "ag");
  const tbBlocks = blocksFromTrace(engine.trace.entries, "tb");
  const cfg = { slotMs, ...s.txConfig };
  return {
    id: s.id,
    untilMs,
    slotsEvaluated: slots,
    ag: agLane,
    tb: tbLane,
    agLongestGapMs: longest * slotMs,
    txs: s.txs.map((tx) => ({
      id: tx.id,
      ag: analyzeTx(tx, agBlocks, agResult(engine.state), engine.now, cfg),
      tb: analyzeTx(tx, tbBlocks, tbResult(engine.state), engine.now, cfg),
    })),
  };
}
