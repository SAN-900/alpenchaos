import type { TraceEntry } from "@alpenchaos/shared";

export type TxConfig = {
  slotMs: number;
  /** A blockhash is valid for this many slots after the slot it was fetched at (Solana: 150). */
  maxAgeSlots: number;
  /** How many slots ahead of arrival the client keeps forwarding to upcoming leaders. */
  forwardSlots: number;
};
export const DEFAULT_TX_CONFIG: TxConfig = { slotMs: 400, maxAgeSlots: 150, forwardSlots: 4 };

export type TxSpec = {
  id: string;
  /** When the client sent it (simulated ms). */
  sentAt: number;
  /** Client -> leader latency. Default 20ms. */
  uplinkMs?: number;
  /** Slot the blockhash was fetched at. Default: the slot containing sentAt. */
  recentSlot?: number;
};

/** A block a leader actually produced (from the protocol's "<name>:block" trace entries). */
export type BlockRecord = { slot: number; leader: number; time: number };

/** What a protocol decided about a slot. Adapt from slotStatus()/legacyStatus(). */
export type SlotResult = { status: "finalized" | "skipped"; at: number } | undefined;

export type TxOutcome =
  /** Blockhash too old: rejected at the leader, never lands. */
  | { status: "expired"; reason: string }
  /** Arrived but no leader produced a block within the forward window. */
  | { status: "dropped"; reason: string }
  /** Waiting: either no block yet, or included but the slot is not settled. */
  | { status: "pending"; includedSlot?: number }
  | { status: "landed"; includedSlot: number; confirmedAt: number; latencyMs: number }
  /** Included in a block whose slot was then skipped: the bank was abandoned and the tx is lost. */
  | { status: "abandoned"; includedSlot: number; decidedAt: number; retryable: boolean };

/** Extract produced blocks for one protocol from the engine trace. */
export function blocksFromTrace(entries: readonly TraceEntry[], proto: string): BlockRecord[] {
  return entries
    .filter((e) => e.kind === `${proto}:block`)
    .map((e) => ({ slot: e.slot as number, leader: e.leader as number, time: e.time }));
}

/**
 * Decide what happened to a transaction, after the fact, from the blocks that
 * were produced and what the protocol decided about each slot. Pure function:
 * run it against Alpenglow and legacy results to compare the same tx.
 *
 * Rules: the tx reaches the leader at sentAt + uplink and goes into the first
 * block built at or after that moment (blocks are built at slot start), within
 * `forwardSlots`. If the blockhash is older than `maxAgeSlots` when it arrives
 * or is included, it expires. If the slot with its block is later skipped, the
 * tx is lost ("abandoned"); `retryable` says whether the blockhash is still
 * valid when the client learns that.
 *
 * Not modelled: fees, compute limits, block capacity, duplicate sends, forks.
 */
export function analyzeTx(
  tx: TxSpec,
  blocks: readonly BlockRecord[],
  result: (slot: number) => SlotResult,
  now: number,
  cfg: Partial<TxConfig> = {},
): TxOutcome {
  const c = { ...DEFAULT_TX_CONFIG, ...cfg };
  const uplink = tx.uplinkMs ?? 20;
  const arrival = tx.sentAt + uplink;
  const recent = tx.recentSlot ?? Math.floor(tx.sentAt / c.slotMs);
  const lastValidSlot = recent + c.maxAgeSlots;

  if (Math.floor(arrival / c.slotMs) > lastValidSlot) {
    return { status: "expired", reason: "blockhash expired before the tx reached a leader" };
  }

  const horizon = arrival + c.forwardSlots * c.slotMs;
  let inc: BlockRecord | undefined;
  for (const b of blocks) {
    if (b.time >= arrival && b.time <= horizon && (!inc || b.time < inc.time)) inc = b;
  }

  if (!inc) {
    return now >= horizon
      ? { status: "dropped", reason: "no leader produced a block within the forward window" }
      : { status: "pending" };
  }
  if (inc.slot > lastValidSlot) {
    return { status: "expired", reason: "blockhash expired before the tx could be included" };
  }

  const r = result(inc.slot);
  if (!r) return { status: "pending", includedSlot: inc.slot };
  if (r.status === "finalized") {
    return { status: "landed", includedSlot: inc.slot, confirmedAt: r.at, latencyMs: r.at - tx.sentAt };
  }
  return {
    status: "abandoned",
    includedSlot: inc.slot,
    decidedAt: r.at,
    retryable: r.at + uplink <= (lastValidSlot + 1) * c.slotMs,
  };
}
