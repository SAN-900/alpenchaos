import type { Scenario } from "../types";

/** Four transactions, four fates: landed, dropped, ghosted and expired. */
export const lateTx: Scenario = {
  id: "late-tx",
  name: "Fire too late",
  tagline: "Four transactions, four different fates.",
  description:
    "Transactions are only as good as the leader that receives them and the blockhash they carry. This run sends four: one on a healthy leader, one into a dead leader's window, one into a ghost bank, and one with a blockhash that has already expired. Blockhash lifetime is shortened to 20 slots (8 s) and forwarding to 2 slots so every failure mode fits in a short demo.",
  lesson: "A transaction can fail because nobody is listening, because the block is abandoned, or because it is simply too old.",
  difficulty: 2,
  tags: ["late-tx", "blockhash", "ghost"],
  seed: 7,
  network: { validators: 24 },
  mode: "watch",
  durationMs: 35_000,
  faults: [
    { type: "silenceLeader", slot: 8, windows: 1 },
    { type: "isolate", targets: { leaderOfSlot: 16 }, at: 6_000, healAt: 8_000 },
  ],
  txConfig: { maxAgeSlots: 20, forwardSlots: 2 },
  txs: [
    { id: "healthy", sentAt: 1_000 },
    { id: "dead-leader", sentAt: 3_300 },
    { id: "ghosted", sentAt: 6_390 },
    { id: "stale-blockhash", sentAt: 12_000, recentSlot: 0 },
  ],
  annotations: [
    { at: 1_000, title: "Healthy send", text: "A well-timed transaction reaches a live leader and finalizes.", concept: "tx-landing" },
    { at: 3_300, title: "Dead leader", text: "This transaction reaches a leader that will never produce a block, and the forwarding window runs out.", concept: "forwarding" },
    { at: 6_390, title: "Ghost bank", text: "A cut-off leader builds a block nobody sees. The skipped bank takes the transaction with it.", concept: "abandoned-bank" },
    { at: 12_000, title: "Expired blockhash", text: "Its blockhash was fetched at slot 0 and is only valid for 20 slots. Rejected on arrival.", concept: "blockhash" },
  ],
};
