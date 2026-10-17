import type { Scenario } from "../types";

/** The flip side of fast timeouts: a slow-but-honest leader gets skipped. */
export const laggyLeader: Scenario = {
  id: "laggy-leader",
  name: "Too slow to matter",
  tagline: "Fast timeouts have a price.",
  description:
    "The leader of slots 8-11 is healthy but its link lags by 700 ms, longer than the 450 ms skip timeout. Alpenglow validators give up and skip the slots even though valid blocks were built. Legacy has no such timeout: it waits, and the late blocks eventually land.",
  lesson: "Alpenglow trades patience for speed. A leader that cannot reach validators within the timeout loses its slots, and transactions in those blocks are abandoned. Legacy would have waited and landed them, ~13 s later.",
  difficulty: 2,
  tags: ["latency", "skip", "timeout", "trade-off"],
  seed: 7,
  network: { validators: 24 },
  mode: "watch",
  durationMs: 30_000,
  faults: [{ type: "slow", targets: { leaderOfSlot: 8 }, extraMs: 700, at: 3_100, until: 5_000 }],
  txs: [
    { id: "lands-fine", sentAt: 1_000 },
    { id: "too-slow", sentAt: 3_190 },
  ],
  annotations: [
    { at: 3_100, title: "Leader lags", text: "Everything the leader sends now takes an extra 700 ms.", concept: "latency" },
    { at: 3_650, title: "Timeout beats block", text: "Validators' 450 ms timers fire before the block arrives, so they vote skip.", concept: "timeout" },
    { at: 4_150, title: "Skip certificate", text: "The slot is skipped. The late block is ignored, and your transaction with it.", concept: "skip-certificate" },
  ],
};
