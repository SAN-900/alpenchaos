import type { BlockRecord, TxConfig, TxOutcome, TxSpec } from "@alpenchaos/fault-injection";

export type Role = "chaos" | "defender";

export type Action =
  | { type: "killLeader" }
  | { type: "killValidator"; v: number }
  | { type: "partition"; pct: number }
  | { type: "slowValidator"; v: number }
  | { type: "lossBurst" }
  | { type: "revive"; v: number }
  | { type: "reviveAll" }
  | { type: "healPartition" }
  | { type: "sendTx"; id?: string };

export const CHAOS_ACTIONS: Action["type"][] = ["killLeader", "killValidator", "partition", "slowValidator", "lossBurst"];
export const DEFENDER_ACTIONS: Action["type"][] = ["revive", "reviveAll", "healPartition", "sendTx"];

/** All tunables live here so balance can change without touching logic. Energy costs are in whole units. */
export type GameConfig = {
  durationMs: number;
  /** Sim step. The session only advances in whole steps; actions land on step boundaries. */
  stepMs: number;
  /** Must match the protocol's slot length. */
  slotMs: number;
  energyMaxMilli: number;
  energyStartMilli: number;
  /** Milli-energy regained per simulated ms (1 = one energy unit per second). */
  regenMilliPerMs: number;
  /** A slot older than this with no result counts toward a stall. */
  stallWindowMs: number;
  /** Continuous stall this long ends the match: chaos wins. */
  breakStallMs: number;
  partitionMs: number;
  slowMs: number;
  slowExtraMs: number;
  lossMs: number;
  lossRate: number;
  maxPendingTx: number;
  pts: { skip: number; finalized: number; stallStep: number; txLanded: number; txLost: number };
  costs: {
    killLeader: number; killValidator: number; slowValidator: number; lossBurst: number;
    revive: number; reviveAll: number; healPartition: number; sendTx: number;
    partitionBase: number; partitionPer10: number;
  };
  tx: Partial<TxConfig>;
};

export type PlayerState = { energyMilli: number; at: number; score: number };

export type LoggedAction = { t: number; role: Role; action: Action };
export type TxEntry = { spec: TxSpec; outcome?: TxOutcome; scored: boolean };

/** Plain data, so it snapshots and replays with the engine. */
export type GameState = {
  cfg: GameConfig;
  players: Record<Role, PlayerState>;
  frontier: number;
  unsettled: number[];
  stallMs: number;
  longestStallMs: number;
  totalStallMs: number;
  blocks: BlockRecord[];
  txs: TxEntry[];
  actions: LoggedAction[];
  feed: { t: number; text: string }[];
  over?: { winner: Role; reason: string; at: number };
};

export type ActResult = { ok: true; cost: number } | { ok: false; reason: string };
