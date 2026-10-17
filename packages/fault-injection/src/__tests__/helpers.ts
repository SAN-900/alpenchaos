import { Engine, Rng } from "@alpenchaos/simulation-core";
import {
  createNetwork,
  createWorld,
  createWorldDispatch,
  WORLD_START,
  type NetworkConfig,
  type WorldState,
} from "@alpenchaos/network-simulator";
import { createAlpenglow, slotStatus, type AlpenglowState } from "@alpenchaos/protocol-alpenglow";
import { createTowerBft, legacyStatus, type TowerBftState } from "@alpenchaos/protocol-legacy";
import { blocksFromTrace, type SlotResult } from "../index";

/** Both protocols on the same network. Returns the engine; faults are injected by the caller. */
export function build(cfg: Partial<NetworkConfig> = {}, seed = 1) {
  const ag = createAlpenglow();
  const tb = createTowerBft();
  const net = createNetwork({ validators: 24, ...cfg }, new Rng(seed));
  return new Engine<WorldState>(createWorld(net, [ag, tb]), createWorldDispatch([ag, tb]), seed);
}
export const start = (e: Engine<WorldState>) => void e.schedule(0, "world", WORLD_START);
export const agState = (e: Engine<WorldState>) => e.state.protocols["ag"] as AlpenglowState;
export const tbState = (e: Engine<WorldState>) => e.state.protocols["tb"] as TowerBftState;

/** Adapters from each protocol's state to the protocol-neutral SlotResult. */
export const agResult = (e: Engine<WorldState>) => (s: number): SlotResult => {
  const g = slotStatus(agState(e), s);
  return g && { status: g.status, at: g.at };
};
export const tbResult = (e: Engine<WorldState>) => (s: number): SlotResult => {
  const g = legacyStatus(tbState(e), s);
  return g && { status: g.status, at: g.at };
};
export const agBlocks = (e: Engine<WorldState>) => blocksFromTrace(e.trace.entries, "ag");
export const tbBlocks = (e: Engine<WorldState>) => blocksFromTrace(e.trace.entries, "tb");
