/**
 * All network state is plain data (numbers, strings, arrays, booleans) so it
 * survives structuredClone in engine snapshots. Validators are addressed by
 * index everywhere; `id` ("v0", "v1", ...) is the event target string.
 */
export type Validator = {
  id: string;
  /** Integer stake units. Use integer math for thresholds (see stake.ts). */
  stake: number;
  up: boolean;
  region: number;
};

export type NetworkState = {
  validators: Validator[];
  totalStake: number;
  /** baseLatency[i][j] in integer ms, symmetric, 0 on the diagonal. */
  baseLatency: number[][];
  /** Max extra random ms added to each message (uniform 0..jitterMs). */
  jitterMs: number;
  /** Extra ms added to anything sent from or to validator i (fault injection). */
  extraDelay: number[];
  /** Partition group per validator. Messages only flow within a group. */
  group: number[];
  /** Probability in [0, 1] that any message is dropped. */
  lossRate: number;
  /** Emit a trace entry for every send (can be large with 24+ validators). */
  traceSends: boolean;
  /** Leader per window, as validator indexes. Repeats after the last entry. */
  leaderSchedule: number[];
  slotsPerWindow: number;
};

export type NetworkConfig = {
  validators: number;
  regions?: number;       // default 4
  jitterMs?: number;      // default 10
  zipfS?: number;         // stake skew, default 0.8 (0 = equal stake)
  totalStake?: number;    // default 1_000_000
  leaderWindows?: number; // default 512
  slotsPerWindow?: number; // default 4
  lossRate?: number;      // default 0
  traceSends?: boolean;   // default true
};

/** Body of a "net:msg" event. */
export type NetMessage = { from: number; to: number; kind: string; body: unknown };
