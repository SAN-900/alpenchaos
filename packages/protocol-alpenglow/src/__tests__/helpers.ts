import { Engine, Rng } from "@alpenchaos/simulation-core";
import {
  createNetwork,
  createWorld,
  createWorldDispatch,
  leaderForSlot,
  NET_KILL,
  WORLD_START,
  type NetworkConfig,
  type NetworkState,
  type WorldState,
} from "@alpenchaos/network-simulator";
import { createAlpenglow, type AlpenglowState } from "../index";

export function build(cfg: Partial<NetworkConfig> = {}, seed = 1) {
  const ag = createAlpenglow();
  const net = createNetwork({ validators: 24, ...cfg }, new Rng(seed));
  const e = new Engine<WorldState>(createWorld(net, [ag]), createWorldDispatch([ag]), seed);
  return e;
}

/** Call after scheduling any t=0 faults, so they land before the slot clocks. */
export const start = (e: Engine<WorldState>) => void e.schedule(0, "world", WORLD_START);
export const ag = (e: Engine<WorldState>) => e.state.protocols["ag"] as AlpenglowState;
export const leader = (e: Engine<WorldState>, slot: number) => leaderForSlot(e.state.net, slot);
export const kill = (e: Engine<WorldState>, v: number) => void e.schedule(0, "world", NET_KILL, { v });
export const aliveStake = (net: NetworkState) => net.validators.reduce((a, x) => a + (x.up ? x.stake : 0), 0);
