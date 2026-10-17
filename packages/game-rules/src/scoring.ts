import { analyzeTx, type SlotResult } from "@alpenchaos/fault-injection";
import type { GameState } from "./types";

const note = (g: GameState, t: number, text: string) => {
  g.feed.push({ t, text });
  if (g.feed.length > 60) g.feed.splice(0, g.feed.length - 60);
};

/**
 * Advance scoring by one step, reading the primary protocol's results.
 *  - every slot is scored once when it settles (finalized -> defender, skipped -> chaos);
 *  - each step in which finality is stalled scores for chaos and extends the stall;
 *  - transactions are scored once when their outcome is known;
 *  - ends the match on a long stall (chaos) or at the time limit (higher score).
 */
export function scoreStep(g: GameState, res: (slot: number) => SlotResult, now: number): void {
  const { cfg } = g;

  const lastStarted = Math.floor(now / cfg.slotMs);
  while (g.frontier <= lastStarted) g.unsettled.push(g.frontier++);
  g.unsettled = g.unsettled.filter((s) => {
    const r = res(s);
    if (r) {
      if (r.status === "finalized") g.players.defender.score += cfg.pts.finalized;
      else g.players.chaos.score += cfg.pts.skip;
      return false;
    }
    return s >= lastStarted - 100; // forget slots that never settle
  });

  const aged = Math.floor((now - cfg.stallWindowMs) / cfg.slotMs);
  const stalled = aged >= 2 && [aged, aged - 1, aged - 2].every((s) => !res(s));
  if (stalled) {
    if (g.stallMs === 0) note(g, now, "finality stalled");
    g.stallMs += cfg.stepMs;
    g.totalStallMs += cfg.stepMs;
    g.longestStallMs = Math.max(g.longestStallMs, g.stallMs);
    g.players.chaos.score += cfg.pts.stallStep;
  } else {
    if (g.stallMs > 0) note(g, now, `finality recovered after ${(g.stallMs / 1000).toFixed(1)}s`);
    g.stallMs = 0;
  }

  for (const t of g.txs) {
    if (t.scored) continue;
    const o = analyzeTx(t.spec, g.blocks, res, now, cfg.tx);
    t.outcome = o;
    if (o.status === "landed") {
      g.players.defender.score += cfg.pts.txLanded;
      t.scored = true;
      note(g, now, `${t.spec.id} landed in ${(o.latencyMs / 1000).toFixed(2)}s`);
    } else if (o.status === "abandoned" || o.status === "dropped" || o.status === "expired") {
      g.players.chaos.score += cfg.pts.txLost;
      t.scored = true;
      note(g, now, `${t.spec.id} lost (${o.status})`);
    }
  }

  if (g.stallMs >= cfg.breakStallMs) {
    g.over = { winner: "chaos", reason: `finality stalled for ${(g.stallMs / 1000).toFixed(1)}s`, at: now };
    note(g, now, "Solana broken: chaos wins");
  } else if (now >= cfg.durationMs) {
    const { chaos, defender } = g.players;
    const winner = chaos.score > defender.score ? "chaos" : "defender";
    g.over = { winner, reason: `time up (${chaos.score} to ${defender.score})`, at: now };
    note(g, now, `time up: ${winner} wins`);
  }
}
