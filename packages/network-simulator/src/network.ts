import { Rng } from "@alpenchaos/simulation-core";
import { makeLatencyMatrix } from "./latency";
import { buildLeaderSchedule } from "./leader";
import { makeStakes } from "./stake";
import type { NetworkConfig, NetworkState, Validator } from "./types";

/**
 * Build the initial network. Pass a dedicated Rng (e.g. new Rng(seed)) so
 * setup never consumes draws from the engine's RNG.
 */
export function createNetwork(cfg: NetworkConfig, rng: Rng): NetworkState {
  const n = cfg.validators;
  const regions = cfg.regions ?? 4;
  const stakes = makeStakes(n, cfg.zipfS ?? 0.8, cfg.totalStake ?? 1_000_000);
  const validators: Validator[] = stakes.map((stake, i) => ({
    id: `v${i}`,
    stake,
    up: true,
    region: rng.int(0, regions),
  }));
  const baseLatency = makeLatencyMatrix(validators.map((v) => v.region), regions, rng);
  return {
    validators,
    totalStake: stakes.reduce((a, b) => a + b, 0),
    baseLatency,
    jitterMs: cfg.jitterMs ?? 10,
    extraDelay: new Array<number>(n).fill(0),
    group: new Array<number>(n).fill(0),
    lossRate: cfg.lossRate ?? 0,
    traceSends: cfg.traceSends ?? true,
    leaderSchedule: buildLeaderSchedule(validators, cfg.leaderWindows ?? 512, rng),
    slotsPerWindow: cfg.slotsPerWindow ?? 4,
  };
}
