import type { Scenario } from "../types";

/** A leader goes dark for its whole window and the network has to skip its slots. */
export const leaderKill: Scenario = {
  id: "leader-kill",
  name: "Kill the leader",
  tagline: "A leader vanishes mid-schedule.",
  description:
    "The leader of slots 8-11 crashes right before its window and comes back afterwards. Nobody sends a block, so every validator's timeout fires and they vote to skip.",
  lesson: "Alpenglow notices a missing block after one timeout and certifies a skip. Legacy only learns a slot was skipped when a later slot finally finalizes.",
  difficulty: 1,
  tags: ["leader", "skip"],
  seed: 7,
  network: { validators: 24 },
  mode: "watch",
  durationMs: 30_000,
  faults: [{ type: "silenceLeader", slot: 8, windows: 1 }],
  txs: [
    { id: "before", sentAt: 1_000 },
    { id: "during-outage", sentAt: 3_300 },
  ],
  annotations: [
    { at: 3_200, title: "Leader crashes", text: "The leader for slots 8-11 goes offline. It will not produce any block in this window.", concept: "leader-failure" },
    { at: 3_650, title: "Timeouts fire", text: "No block arrived within 450 ms, so validators broadcast skip votes.", concept: "timeout" },
    { at: 4_000, title: "Skip certificate", text: "60% of stake voting skip forms a skip certificate. The slot is skipped and the chain moves on.", concept: "skip-certificate" },
  ],
};
