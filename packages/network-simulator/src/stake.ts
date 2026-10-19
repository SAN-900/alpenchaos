import { detPow } from "@alpenchaos/simulation-core";
import type { NetworkState } from "./types";

/** Integer stakes following a Zipf-like distribution; sums exactly to `total`. */
export function makeStakes(n: number, s: number, total: number): number[] {
  if (!Number.isInteger(n) || n < 1) throw new RangeError("makeStakes: n must be >= 1");
  const w = Array.from({ length: n }, (_, i) => 1 / detPow(i + 1, s));
  const sumW = w.reduce((a, b) => a + b, 0);
  const stakes = w.map((x) => Math.max(1, Math.floor((total * x) / sumW)));
  const used = stakes.reduce((a, b) => a + b, 0);
  stakes[0] = stakes[0]! + (total - used); // remainder (or deficit) goes to the top validator
  if (stakes[0]! < 1) throw new RangeError("makeStakes: total too small for n");
  return stakes;
}

export function aliveStake(net: NetworkState): number {
  let s = 0;
  for (const v of net.validators) if (v.up) s += v.stake;
  return s;
}

export function stakeOf(net: NetworkState, indices: Iterable<number>): number {
  let s = 0;
  for (const i of indices) s += net.validators[i]!.stake;
  return s;
}

/**
 * Exact "stake >= num/den of total" with integers, so 80% is never lost to
 * floating-point rounding. e.g. meetsThreshold(stake, total, 80, 100).
 */
export function meetsThreshold(stake: number, total: number, num: number, den: number): boolean {
  return stake * den >= total * num;
}
