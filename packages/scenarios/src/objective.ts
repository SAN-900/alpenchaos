import type { GameState } from "@alpenchaos/game-rules";
import type { Objective } from "./types";

export type ObjectiveStatus = { met: boolean; progress: number; label: string };

/** Count of transactions the chaos side has cost the defender. */
const lostTxs = (g: GameState) =>
  g.txs.filter((t) => t.outcome && ["abandoned", "dropped", "expired"].includes(t.outcome.status)).length;

/** How close a match is to its challenge goal. progress is clamped to [0, 1]. */
export function evaluateObjective(g: GameState, o: Objective): ObjectiveStatus {
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  switch (o.kind) {
    case "stall": {
      const best = g.longestStallMs;
      return { met: best >= o.ms, progress: clamp(best / o.ms), label: `Stall finality for ${o.ms / 1000}s (best ${(best / 1000).toFixed(1)}s)` };
    }
    case "chaosScore": {
      const s = g.players.chaos.score;
      return { met: s >= o.points, progress: clamp(s / o.points), label: `Score ${o.points} chaos points (${s})` };
    }
    case "txLost": {
      const n = lostTxs(g);
      return { met: n >= o.count, progress: clamp(n / o.count), label: `Make ${o.count} transactions fail (${n})` };
    }
  }
}
