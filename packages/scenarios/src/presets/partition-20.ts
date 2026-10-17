import type { Scenario } from "../types";

/** 20% of stake is cut off. Fast path is denied but the chain keeps finalizing. */
export const partition20: Scenario = {
  id: "partition-20",
  name: "The 20% split",
  tagline: "Lose the fast path, keep the chain.",
  description:
    "At t=4s a group of smaller validators holding about 20% of stake loses contact with everyone else. The connected side can no longer reach the 80% fast-path threshold, but it still holds about 80% and far more than the 60% the slow path needs. The cut-off validators cannot hear anyone, so their own leader windows get skipped.",
  lesson: "80% for the fast path, 60% for the slow path: losing 20% of stake costs speed, not liveness.",
  difficulty: 2,
  tags: ["partition", "slow-path", "threshold"],
  seed: 7,
  network: { validators: 24 },
  mode: "watch",
  durationMs: 40_000,
  faults: [{ type: "partition", pct: 20, at: 4_000, healAt: 20_000 }],
  txs: [
    { id: "pre-split", sentAt: 2_000 },
    { id: "mid-split", sentAt: 10_000 },
  ],
  annotations: [
    { at: 4_000, title: "Partition", text: "About 20% of stake is isolated. Votes can no longer cross the split.", concept: "partition" },
    { at: 4_600, title: "Fast path denied", text: "The connected side holds less than 80% of stake, so no slot can finalize in one round any more.", concept: "fast-path" },
    { at: 5_200, title: "Slow path takes over", text: "60% of stake is enough for a notarization certificate and then a finalize certificate: two rounds, still sub-second.", concept: "slow-path" },
    { at: 20_000, title: "Healed", text: "The partition ends and the fast path comes back.", concept: "recovery" },
  ],
};
