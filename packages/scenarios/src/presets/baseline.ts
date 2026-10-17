import type { Scenario } from "../types";

/** Healthy network, no faults. The reference everything else is compared to. */
export const baseline: Scenario = {
  id: "baseline",
  name: "Business as usual",
  tagline: "No faults. Watch finality race.",
  description:
    "24 validators, stake-weighted leaders, a healthy network. Alpenglow's fast path finalizes each slot in a single voting round while legacy Tower BFT waits for votes to stack up to depth 32.",
  lesson: "With nothing going wrong, Alpenglow finalizes in about one network round trip; Tower BFT needs ~12-13 seconds.",
  difficulty: 1,
  tags: ["intro", "comparison"],
  seed: 1,
  network: { validators: 24 },
  mode: "watch",
  durationMs: 30_000,
  faults: [],
  txs: [{ id: "tx1", sentAt: 1_000 }],
  annotations: [
    { at: 0, title: "Slot clock starts", text: "Every validator runs its own 400 ms slot clock. The leader of each 4-slot window broadcasts a block at the start of its slot.", concept: "slot" },
    { at: 600, title: "Fast path", text: "Once validators holding at least 80% of stake vote to notarize, the slot is finalized in one round. No second vote needed.", concept: "fast-path" },
    { at: 13_500, title: "Legacy catches up", text: "Tower BFT only finalizes a slot after 32 confirmations pile up on top of it and 2/3 of stake have rooted it.", concept: "tower-lockout" },
  ],
};
