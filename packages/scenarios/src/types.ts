import type { TxConfig, TxSpec } from "@alpenchaos/fault-injection";
import type { GameConfig } from "@alpenchaos/game-rules";
import type { NetworkConfig } from "@alpenchaos/network-simulator";
import type { AgConfig } from "@alpenchaos/protocol-alpenglow";
import type { TbConfig } from "@alpenchaos/protocol-legacy";

/**
 * Who a fault applies to. Resolved against the seeded network, because "the
 * leader of slot 24" or "the biggest 20% of stake" depend on the seed.
 */
export type Target =
  | number[]                                          // explicit validator indexes
  | { pct: number; from?: "top" | "bottom" }          // smallest set holding >= pct% of stake
  | { leaderOfSlot: number };                         // whoever leads that slot

/**
 * A fault as pure JSON. All times are absolute simulated ms. This is what makes
 * a scenario serializable: saved to a file, sent over the wire, stored in a
 * replay row. `resolveFaults` turns these into the FaultScript the engine takes.
 */
export type FaultSpec =
  /** Crash the leader of `slot` when its window starts (or at `at`). Stays down. */
  | { type: "killLeader"; slot: number; at?: number }
  /** Leader of `slot` misses `windows` leader window(s), then returns. */
  | { type: "silenceLeader"; slot: number; windows?: number }
  | { type: "kill"; v: number; at: number }
  | { type: "revive"; v: number; at: number }
  /** Crash >= pct% of stake. `reviveAt` brings them all back. */
  | { type: "crashStake"; pct: number; at: number; from?: "top" | "bottom"; reviveAt?: number }
  /**
   * Cut >= pct% of stake off from the rest. `from: "bottom"` (default) takes many
   * small validators and lands close to pct; "top" takes the biggest, which
   * overshoots (the top validator alone can hold ~20%).
   */
  | { type: "partition"; pct: number; at: number; healAt?: number; from?: "top" | "bottom" }
  /** Cut specific validators off from everyone else (e.g. a leader whose blocks nobody sees). */
  | { type: "isolate"; targets: Target; at: number; healAt?: number }
  | { type: "heal"; at: number }
  /** Add extraMs latency to everything sent from/to the targets. */
  | { type: "slow"; targets: Target; extraMs: number; at: number; until?: number }
  /** Drop a fraction of all messages between `at` and `until`. */
  | { type: "loss"; rate: number; at: number; until: number };

/** Educational overlay. The UI shows it when sim time reaches `at`. */
export type Annotation = {
  at: number;
  title: string;
  text: string;
  /** Optional hook for "Explain this event" deep links in the UI. */
  concept?: string;
};

/** Challenge-mode goal, evaluated against GameState. */
export type Objective =
  | { kind: "stall"; ms: number }          // longest continuous finality stall >= ms
  | { kind: "chaosScore"; points: number } // chaos score >= points
  | { kind: "txLost"; count: number };     // >= count transactions abandoned/dropped/expired

export type Difficulty = 1 | 2 | 3;

export type Scenario = {
  id: string;
  name: string;
  tagline: string;
  /** Longer explanation for the picker / intro screen. */
  description: string;
  /** What the viewer should have learned at the end. */
  lesson: string;
  difficulty: Difficulty;
  tags: string[];

  /** Drives the network layout, leader schedule and engine RNG. Same seed, same match. */
  seed: number;
  network: NetworkConfig;
  /** Optional protocol tuning. slotMs must agree with game.slotMs (default 400). */
  protocol?: { ag?: Partial<AgConfig>; tb?: Partial<TbConfig> };

  /**
   * "watch": scripted, runs by itself (landing page, comparison demo).
   * "play": same script runs as background noise, players add their own actions.
   */
  mode: "watch" | "play";
  /** How long the scenario runs (also the match length in play mode). */
  durationMs: number;

  faults: FaultSpec[];
  /** Scripted transactions, analysed against both protocols. */
  txs: TxSpec[];
  /** Overrides for blockhash lifetime etc. (e.g. a short lifetime so expiry fits in a demo). */
  txConfig?: Partial<TxConfig>;
  /** Balance overrides for play mode. */
  game?: Partial<GameConfig>;
  objective?: Objective;
  annotations: Annotation[];
};
