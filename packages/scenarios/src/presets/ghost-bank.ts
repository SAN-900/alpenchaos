import type { Scenario } from "../types";

/** A leader builds blocks that nobody else ever sees. Transactions inside them are lost. */
export const ghostBank: Scenario = {
  id: "ghost-bank",
  name: "Ghost bank",
  tagline: "Your transaction lands in a block that never existed.",
  description:
    "The leader of slots 8-11 is alive and happily building blocks, but a network fault cuts it off from everyone else. Nobody receives its blocks, so every slot in its window is skipped. A transaction that reached this leader sits in a bank that no one will ever build on.",
  lesson: "A produced block is not a finalized block: only a certificate makes a transaction real. Alpenglow tells the sender in about a second. Legacy needs ~13 s to even learn the bank was abandoned.",
  difficulty: 2,
  tags: ["late-tx", "ghost", "skip", "leader"],
  seed: 7,
  network: { validators: 24 },
  mode: "watch",
  durationMs: 30_000,
  faults: [{ type: "isolate", targets: { leaderOfSlot: 8 }, at: 3_000, healAt: 5_000 }],
  txs: [
    { id: "lands-fine", sentAt: 1_000 },
    { id: "ghosted", sentAt: 3_190 },
  ],
  annotations: [
    { at: 3_000, title: "Leader cut off", text: "The leader of slots 8-11 loses its connection to every other validator but keeps running.", concept: "partition" },
    { at: 3_210, title: "Bank built", text: "Your transaction reaches the leader and goes into a block. Only the leader has it.", concept: "bank" },
    { at: 3_650, title: "Timeout", text: "Everyone else is still waiting for a block that is never going to arrive, so they vote skip.", concept: "timeout" },
    { at: 4_150, title: "Abandoned", text: "A skip certificate forms. The bank is abandoned and the transaction is lost. The sender can retry as soon as they learn this.", concept: "abandoned-bank" },
  ],
};
