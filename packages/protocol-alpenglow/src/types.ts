export type AgConfig = {
  /** Slot duration. */
  slotMs: number;
  /** How long after slot start a validator waits for a block before voting skip. */
  timeoutMs: number;
  /** Fast path: percent of stake that must vote notarize for single-round finality. */
  fastPct: number;
  /** Slow path / certificates: percent of stake for notarization, finalization and skip certificates. */
  slowPct: number;
};

/** One validator's local view of one slot. */
export type SlotView = {
  vote: "none" | "notar" | "skip";
  notar: number[];
  final: number[];
  skip: number[];
  fastCert: boolean;
  notarCert: boolean;
  skipCert: boolean;
  finalVoted: boolean;
  result?: "finalized" | "skipped";
  path?: "fast" | "slow";
  at?: number;
};

/** First time ANY validator settled a slot. This is what the UI lanes show. */
export type GlobalSlot = {
  status: "finalized" | "skipped";
  path?: "fast" | "slow";
  at: number;
  by: number;
  /** Time since the slot's scheduled start. */
  latencyMs: number;
};

export type AlpenglowState = {
  cfg: AgConfig;
  /** Current slot per validator (-1 before its clock starts). */
  cur: number[];
  /** views[v][slot] */
  views: Record<string, SlotView>[];
  global: Record<string, GlobalSlot>;
};
