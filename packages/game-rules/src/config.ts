import type { GameConfig, GameState } from "./types";

export const DEFAULT_GAME_CONFIG: GameConfig = {
  durationMs: 60_000,
  stepMs: 100,
  slotMs: 400,
  energyMaxMilli: 10_000,
  energyStartMilli: 6_000,
  regenMilliPerMs: 1,
  stallWindowMs: 600,
  breakStallMs: 4_000,
  partitionMs: 10_000,
  slowMs: 5_000,
  slowExtraMs: 300,
  lossMs: 3_000,
  lossRate: 0.3,
  maxPendingTx: 3,
  pts: { skip: 5, finalized: 1, stallStep: 1, txLanded: 5, txLost: 8 },
  costs: {
    killLeader: 3, killValidator: 1, slowValidator: 1, lossBurst: 2,
    revive: 1, reviveAll: 5, healPartition: 3, sendTx: 0,
    partitionBase: 2, partitionPer10: 1,
  },
  tx: {},
};

export function makeConfig(over: Partial<GameConfig> = {}): GameConfig {
  const d = DEFAULT_GAME_CONFIG;
  return { ...d, ...over, pts: { ...d.pts, ...over.pts }, costs: { ...d.costs, ...over.costs }, tx: { ...d.tx, ...over.tx } };
}

export function newGameState(cfg: GameConfig): GameState {
  const p = () => ({ energyMilli: cfg.energyStartMilli, at: 0, score: 0 });
  return {
    cfg,
    players: { chaos: p(), defender: p() },
    frontier: 0,
    partitionUntil: 0,
    lossUntil: 0,
    slowUntil: {},
    unsettled: [],
    stallMs: 0,
    longestStallMs: 0,
    totalStallMs: 0,
    blocks: [],
    txs: [],
    actions: [],
    feed: [],
  };
}
