import type { Scenario } from "../types";

/**
 * The "20+20" resilience claim, approximated: 20% of stake offline and another
 * ~20% lagging badly. (Byzantine/equivocating behaviour is not modelled.)
 */
export const twentyTwenty: Scenario = {
  id: "twenty-twenty",
  name: "20 + 20",
  tagline: "20% offline, 20% sabotaged. Does it finalize?",
  description:
    "Alpenglow is designed to stay safe against 20% adversarial stake and live with another 20% offline. Here ~20% of stake crashes and the largest validators get +150 ms of latency. Equivocation is not modelled, so this is the closest approximation of the attack that the simulator can express.",
  lesson: "The protocol is built around overlapping thresholds. Faults eat into the margin, and the margin is what you watch shrink.",
  difficulty: 3,
  tags: ["crash", "latency", "resilience"],
  seed: 3,
  network: { validators: 24 },
  mode: "watch",
  durationMs: 30_000,
  faults: [
    { type: "crashStake", pct: 20, at: 4_000, from: "bottom" },
    { type: "slow", targets: { pct: 20, from: "top" }, extraMs: 150, at: 4_000 },
  ],
  txs: [{ id: "under-fire", sentAt: 10_000 }],
  annotations: [
    { at: 4_000, title: "20 + 20", text: "A fifth of stake crashes while another fifth slows down. The remaining healthy stake is only just above the 60% line.", concept: "20-20" },
  ],
};
