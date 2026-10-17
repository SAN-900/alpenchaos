import type { Scenario } from "../types";

/** A 40% split: neither side can reach 60%, finality halts until it heals. */
export const partition40: Scenario = {
  id: "partition-40",
  name: "Split brain",
  tagline: "Neither side has 60%. Finality stops.",
  description:
    "Roughly 40% of stake is cut off. The larger side falls short of the 60% needed for any certificate, so nothing can finalize or even be skipped until the network heals.",
  lesson: "Safety over liveness: with more than 40% of stake unreachable the protocol halts rather than risk two conflicting finalized histories.",
  difficulty: 3,
  tags: ["partition", "stall", "safety"],
  seed: 7,
  network: { validators: 24 },
  mode: "watch",
  durationMs: 30_000,
  faults: [{ type: "partition", pct: 40, at: 4_000, healAt: 12_000, from: "top" }],
  txs: [{ id: "caught-in-the-split", sentAt: 5_000 }],
  annotations: [
    { at: 4_000, title: "40% cut off", text: "The network splits into a ~40% side and a ~60% side, and neither can talk to the other.", concept: "partition" },
    { at: 5_000, title: "No certificates", text: "Neither side can gather 60% of stake, so there are no notarization, finalization or skip certificates.", concept: "threshold" },
    { at: 12_000, title: "Healed", text: "Votes flow again. Slots from the stall that are still undecided stay pending in this simplified model.", concept: "recovery" },
  ],
};
