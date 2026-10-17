import { Rng } from "@alpenchaos/simulation-core";
import { createNetwork, leaderForSlot, type NetworkConfig, type WorldState } from "@alpenchaos/network-simulator";
import { createAlpenglow, slotStatus, type AlpenglowState } from "@alpenchaos/protocol-alpenglow";
import { createTowerBft } from "@alpenchaos/protocol-legacy";
import type { SlotResult } from "@alpenchaos/fault-injection";
import { GameSession, type GameConfig } from "../index";

export function makeSession(over: Partial<GameConfig> = {}, seed = 1, net: Partial<NetworkConfig> = {}) {
  const ag = createAlpenglow();
  const tb = createTowerBft();
  const network = createNetwork({ validators: 24, ...net }, new Rng(seed));
  return new GameSession({
    net: network,
    protocols: [ag, tb],
    primary: "ag",
    seed,
    config: over,
    result: (w: WorldState) => (s: number): SlotResult => {
      const g = slotStatus(w.protocols["ag"] as AlpenglowState, s);
      return g && { status: g.status, at: g.at };
    },
  });
}
export const leader = (s: GameSession, slot: number) => leaderForSlot(s.engine.state.net, slot);
