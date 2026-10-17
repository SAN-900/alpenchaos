import type { Scenario } from "../types";

/** Several leaders in a row fail, plus a burst of packet loss. */
export const rollingBlackout: Scenario = {
  id: "rolling-blackout",
  name: "Rolling blackout",
  tagline: "Leader after leader goes dark.",
  description:
    "Three consecutive leader windows are silenced: twelve slots with no block at all. A stress test of timeouts, skip certificates and recovery.",
  lesson: "Skips compose: twelve missing slots in a row just means twelve skip certificates, and the chain keeps going.",
  difficulty: 3,
  tags: ["leader", "skip", "stress"],
  seed: 21,
  network: { validators: 24 },
  mode: "watch",
  durationMs: 40_000,
  faults: [
    { type: "silenceLeader", slot: 8, windows: 1 },
    { type: "silenceLeader", slot: 12, windows: 1 },
    { type: "silenceLeader", slot: 16, windows: 1 },
  ],
  txs: [
    { id: "early", sentAt: 1_000 },
    { id: "mid-blackout", sentAt: 5_500 },
    { id: "after", sentAt: 17_000 },
  ],
  annotations: [
    { at: 3_200, title: "Blackout begins", text: "The first of three consecutive leaders goes dark.", concept: "leader-failure" },
    { at: 8_000, title: "Still going", text: "Twelve slots in a row have been skipped. Each one needed its own skip certificate, and the chain never stopped.", concept: "skip-certificate" },
  ],
};
