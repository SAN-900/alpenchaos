import type { Rng } from "@alpenchaos/simulation-core";

/**
 * Symmetric base-latency matrix (integer ms). Same-region pairs are fast,
 * cross-region pairs are slower, and each region pair has a consistent base
 * plus small per-pair noise.
 */
export function makeLatencyMatrix(
  regionOf: number[],
  regions: number,
  rng: Rng,
  intra: [number, number] = [5, 20],
  inter: [number, number] = [30, 150],
): number[][] {
  const regionBase: number[][] = Array.from({ length: regions }, () => new Array<number>(regions).fill(0));
  for (let a = 0; a < regions; a++) {
    for (let b = a; b < regions; b++) {
      const v = a === b ? rng.int(intra[0], intra[1] + 1) : rng.int(inter[0], inter[1] + 1);
      regionBase[a]![b] = v;
      regionBase[b]![a] = v;
    }
  }
  const n = regionOf.length;
  const m: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const v = regionBase[regionOf[i]!]![regionOf[j]!]! + rng.int(0, 6);
      m[i]![j] = v;
      m[j]![i] = v;
    }
  }
  return m;
}
