import type { Rng } from "@alpenchaos/simulation-core";
import type { NetworkState, Validator } from "./types";

/** Stake-weighted leader per window (a window is `slotsPerWindow` slots). */
export function buildLeaderSchedule(validators: Validator[], windows: number, rng: Rng): number[] {
  const total = validators.reduce((a, v) => a + v.stake, 0);
  const out: number[] = [];
  for (let w = 0; w < windows; w++) {
    let r = rng.int(0, total);
    let pick = validators.length - 1;
    for (let i = 0; i < validators.length; i++) {
      r -= validators[i]!.stake;
      if (r < 0) {
        pick = i;
        break;
      }
    }
    out.push(pick);
  }
  return out;
}

export function leaderForSlot(net: NetworkState, slot: number): number {
  const w = Math.floor(slot / net.slotsPerWindow) % net.leaderSchedule.length;
  return net.leaderSchedule[w]!;
}
