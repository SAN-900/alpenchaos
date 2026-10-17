import {
  NET_DELAY,
  NET_HEAL,
  NET_KILL,
  NET_LOSS,
  NET_PARTITION,
  NET_REVIVE,
  leaderForSlot,
  type NetworkState,
} from "@alpenchaos/network-simulator";
import type { FaultScript } from "./script";

export type Timing = { slotMs?: number };
const SLOT_MS = 400;

export const kill = (v: number, at: number): FaultScript => [{ at, kind: NET_KILL, payload: { v }, label: `kill v${v}` }];
export const revive = (v: number, at: number): FaultScript => [{ at, kind: NET_REVIVE, payload: { v }, label: `revive v${v}` }];
export const heal = (at: number): FaultScript => [{ at, kind: NET_HEAL, payload: {}, label: "heal partition" }];

/** Start time (ms) of the leader window that contains `slot`. */
export function windowStart(net: NetworkState, slot: number, slotMs = SLOT_MS): number {
  return Math.floor(slot / net.slotsPerWindow) * net.slotsPerWindow * slotMs;
}

/** Crash the leader of `slot` (default: when its window starts). It stays down. */
export function killLeader(net: NetworkState, slot: number, opts: Timing & { at?: number } = {}): FaultScript {
  const v = leaderForSlot(net, slot);
  return kill(v, opts.at ?? windowStart(net, slot, opts.slotMs));
}

/**
 * Make the leader of `slot` miss its leader window(s), then come back.
 * Implemented as crash + revive, so the validator also stops voting during
 * the window. Its blocks never exist, so those slots must be skipped.
 */
export function silenceLeader(
  net: NetworkState,
  slot: number,
  opts: Timing & { windows?: number } = {},
): FaultScript {
  const slotMs = opts.slotMs ?? SLOT_MS;
  const v = leaderForSlot(net, slot);
  const start = windowStart(net, slot, slotMs);
  const end = start + (opts.windows ?? 1) * net.slotsPerWindow * slotMs;
  return [...kill(v, start), ...revive(v, end - 1)];
}

/**
 * Smallest set of validators holding at least `pct` percent of total stake,
 * taken from the largest ("top") or smallest ("bottom") end. Exact integers.
 */
export function pickByStake(net: NetworkState, pct: number, from: "top" | "bottom" = "bottom"): number[] {
  const n = net.validators.length;
  const order = Array.from({ length: n }, (_, i) => (from === "top" ? i : n - 1 - i));
  const picked: number[] = [];
  let acc = 0;
  for (const i of order) {
    if (acc * 100 >= net.totalStake * pct) break;
    picked.push(i);
    acc += net.validators[i]!.stake;
  }
  return picked;
}

/** Crash validators worth at least `pct` percent of stake. */
export function crashStake(
  net: NetworkState,
  pct: number,
  opts: { at: number; from?: "top" | "bottom" },
): FaultScript {
  return pickByStake(net, pct, opts.from ?? "bottom").flatMap((v) => kill(v, opts.at));
}

/** Cut the largest validators worth at least `pct` percent of stake off from the rest. */
export function partitionStake(net: NetworkState, pct: number, opts: { at: number; healAt?: number }): FaultScript {
  const group = pickByStake(net, pct, "top");
  return [
    { at: opts.at, kind: NET_PARTITION, payload: { groups: [group] }, label: `partition ${pct}% stake` },
    ...(opts.healAt === undefined ? [] : heal(opts.healAt)),
  ];
}

/** Add `extraMs` of latency to every message from/to these validators, optionally until `until`. */
export function slowValidators(vs: number[], extraMs: number, opts: { at: number; until?: number }): FaultScript {
  const on = vs.map((v) => ({ at: opts.at, kind: NET_DELAY, payload: { v, extraMs }, label: `slow v${v} +${extraMs}ms` }));
  const off = opts.until === undefined ? [] : vs.map((v) => ({ at: opts.until!, kind: NET_DELAY, payload: { v, extraMs: 0 } }));
  return [...on, ...off];
}

/** Drop a fraction of all messages between `at` and `until`. */
export function lossBurst(rate: number, opts: { at: number; until: number }): FaultScript {
  return [
    { at: opts.at, kind: NET_LOSS, payload: { rate }, label: `${Math.round(rate * 100)}% packet loss` },
    { at: opts.until, kind: NET_LOSS, payload: { rate: 0 } },
  ];
}
