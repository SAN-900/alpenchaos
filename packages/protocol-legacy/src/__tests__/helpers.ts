import { Engine, Rng } from "@alpenchaos/simulation-core";
import {
  createNetwork,
  createWorld,
  createWorldDispatch,
  leaderForSlot,
  NET_KILL,
  WORLD_START,
  type NetworkConfig,
  type WorldState,
} from "@alpenchaos/network-simulator";
import { createAlpenglow, type AlpenglowState } from "@alpenchaos/protocol-alpenglow";
import { createTowerBft, type TowerBftState } from "../index";

/** Both protocols on the same network and the same faults. */
export function build(cfg: Partial<NetworkConfig> = {}, seed = 1) {
  const ag = createAlpenglow();
  const tb = createTowerBft();
  const net = createNetwork({ validators: 24, ...cfg }, new Rng(seed));
  return new Engine<WorldState>(createWorld(net, [ag, tb]), createWorldDispatch([ag, tb]), seed);
}
export const start = (e: Engine<WorldState>) => void e.schedule(0, "world", WORLD_START);
export const kill = (e: Engine<WorldState>, v: number) => void e.schedule(0, "world", NET_KILL, { v });
export const leader = (e: Engine<WorldState>, slot: number) => leaderForSlot(e.state.net, slot);
export const tb = (e: Engine<WorldState>) => e.state.protocols["tb"] as TowerBftState;
export const ag = (e: Engine<WorldState>) => e.state.protocols["ag"] as AlpenglowState;
