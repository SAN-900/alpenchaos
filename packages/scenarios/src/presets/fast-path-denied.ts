import type { Scenario } from "../types";

/** Crash 20% of stake: the fast path is impossible, the slow path carries on. */
export const fastPathDenied: Scenario = {
  id: "fast-path-denied",
  name: "Fast path denied",
  tagline: "Crash 20% of stake and watch the slow path.",
  description:
    "At t=4s validators worth at least 20% of stake crash. Less than 80% of stake can vote now, so the single-round fast path can never fire. The two-round slow path (60%) finalizes everything.",
  lesson: "Finality gets roughly one round trip slower, and still beats legacy by an order of magnitude.",
  difficulty: 2,
  tags: ["crash", "slow-path", "threshold"],
  seed: 3,
  network: { validators: 24 },
  mode: "watch",
  durationMs: 30_000,
  faults: [{ type: "crashStake", pct: 20, at: 4_000, from: "bottom" }],
  txs: [{ id: "after-crash", sentAt: 8_000 }],
  annotations: [
    { at: 4_000, title: "20% crash", text: "A fifth of the stake goes offline at once.", concept: "crash" },
    { at: 4_800, title: "Slow path", text: "Fewer than 80% of stake can vote notarize, so slots now finalize via the second round (finalize votes at 60%).", concept: "slow-path" },
  ],
};
