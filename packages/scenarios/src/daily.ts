import { Rng } from "@alpenchaos/simulation-core";
import type { FaultSpec, Objective, Scenario } from "./types";

/** FNV-1a, 32-bit. Stable across platforms and engines. */
export function seedFromString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) & 0x7fffffff;
}

/** UTC calendar day as YYYY-MM-DD. Everyone on Earth gets the same daily. */
export function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length)]!;

/**
 * The daily challenge: a play-mode match whose network shape, background
 * outages and goal all come from the date. Pure: same date, same scenario,
 * on the server and in every browser. Accepts a Date or a "YYYY-MM-DD" key.
 */
export function dailyScenario(date: Date | string = new Date()): Scenario {
  const key = typeof date === "string" ? date : dateKey(date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new RangeError(`dailyScenario: expected YYYY-MM-DD, got "${key}"`);

  const seed = seedFromString(`alpenchaos:daily:${key}`);
  const rng = new Rng(seed ^ 0x5eed); // separate from the engine's own stream

  const validators = pick(rng, [16, 20, 24, 28, 32]);
  const zipfS = pick(rng, [0.6, 0.8, 1.0, 1.2]);
  const jitterMs = pick(rng, [5, 10, 20, 40]);
  const regions = pick(rng, [3, 4, 5, 6]);

  // 0-2 background leader outages, aligned to window starts (4 slots per window).
  const faults: FaultSpec[] = [];
  const outages = rng.int(0, 3);
  const used = new Set<number>();
  for (let i = 0; i < outages; i++) {
    const w = rng.int(5, 35);
    if (used.has(w)) continue;
    used.add(w);
    faults.push({ type: "silenceLeader", slot: w * 4, windows: 1 });
  }
  faults.sort((a, b) => (a as { slot: number }).slot - (b as { slot: number }).slot);

  const objective: Objective = pick<Objective>(rng, [
    { kind: "stall", ms: pick(rng, [2000, 3000]) },
    { kind: "chaosScore", points: pick(rng, [60, 90, 120]) },
    { kind: "txLost", count: pick(rng, [2, 3]) },
  ]);

  // Concentrated stake makes a few validators matter a lot: harder to defend.
  const difficulty = zipfS >= 1.0 ? 3 : zipfS >= 0.8 ? 2 : 1;

  return {
    id: `daily-${key}`,
    name: `Daily ${key}`,
    tagline: "Same network for everyone, today only.",
    description: `${validators} validators across ${regions} regions, ${jitterMs} ms of jitter, stake skew ${zipfS}. ${
      faults.length ? `${faults.length} leader outage${faults.length > 1 ? "s" : ""} are already scheduled. ` : "The network starts out healthy. "
    }Beat the objective before the clock runs out.`,
    lesson: "Stake concentration decides how much damage a single fault can do.",
    difficulty,
    tags: ["daily", "challenge"],
    seed,
    network: { validators, zipfS, jitterMs, regions },
    mode: "play",
    durationMs: 60_000,
    faults,
    txs: [],
    objective,
    annotations: [],
  };
}
