export const LIVE_CLUSTERS = [
  "devnet",
  "testnet",
  "mainnet",
] as const;

export type LiveCluster = (typeof LIVE_CLUSTERS)[number];

export type ConsensusStatus =
  | "active"
  | "not_migrated"
  | "unsupported"
  | "unavailable";

export type ObserverHealth = "online" | "degraded" | "offline";

export interface LiveSnapshot {
  cluster: LiveCluster;
  health: ObserverHealth;

  consensus: {
    status: ConsensusStatus;
    certificateSlot: number | null;
    error: string | null;
  };

  slots: {
    processed: number | null;
    finalized: number | null;
    lag: number | null;
    error: string | null;
  };

  updatedAt: string;
  lastSuccessAt: string | null;
}