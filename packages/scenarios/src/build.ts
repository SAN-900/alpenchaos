import { injectFaults, type FaultScript, type SlotResult } from "@alpenchaos/fault-injection";
import { GameSession, type GameConfig } from "@alpenchaos/game-rules";
import {
  createNetwork,
  createWorld,
  createWorldDispatch,
  WORLD_START,
  type NetworkState,
  type WorldState,
} from "@alpenchaos/network-simulator";
import { createAlpenglow, slotStatus, type AlpenglowState } from "@alpenchaos/protocol-alpenglow";
import { createTowerBft, legacyStatus, type TowerBftState } from "@alpenchaos/protocol-legacy";
import { Engine, Rng } from "@alpenchaos/simulation-core";
import { resolveFaults } from "./faults";
import type { Scenario } from "./types";

/** Slot length shared by both protocols and the game rules. */
export const slotMsOf = (s: Scenario): number => s.protocol?.ag?.slotMs ?? 400;

/**
 * Build the scenario's network. Uses its own Rng(seed), so setup never
 * consumes draws from the engine's RNG (same convention as the tests).
 */
export function buildNetwork(s: Scenario, overrides: { traceSends?: boolean } = {}): NetworkState {
  return createNetwork({ ...s.network, ...overrides }, new Rng(s.seed));
}

/** Protocol-neutral result readers, in the shape fault-injection / game-rules expect. */
export const agResult = (w: WorldState) => (slot: number): SlotResult => {
  const g = slotStatus(w.protocols["ag"] as AlpenglowState, slot);
  return g && { status: g.status, at: g.at };
};
export const tbResult = (w: WorldState) => (slot: number): SlotResult => {
  const g = legacyStatus(w.protocols["tb"] as TowerBftState, slot);
  return g && { status: g.status, at: g.at };
};

export type ScenarioSim = {
  engine: Engine<WorldState>;
  script: FaultScript;
};

/**
 * Headless / sandbox engine: Alpenglow ("ag") and legacy Tower BFT ("tb") side
 * by side on the same network with the scenario's faults already scheduled.
 * Nothing has run yet; drive it with engine.runUntil(t) from your frame loop.
 */
export function createScenarioEngine(s: Scenario, opts: { traceSends?: boolean } = {}): ScenarioSim {
  const ag = createAlpenglow(s.protocol?.ag);
  const tb = createTowerBft(s.protocol?.tb);
  const net = buildNetwork(s, opts);
  const engine = new Engine<WorldState>(createWorld(net, [ag, tb]), createWorldDispatch([ag, tb]), s.seed);
  const script = resolveFaults(net, s.faults, slotMsOf(s));
  injectFaults(engine, script); // before WORLD_START so t=0 faults land ahead of the slot clocks
  engine.schedule(0, "world", WORLD_START);
  return { engine, script };
}

/**
 * Interactive match for "play" mode. Scripted faults run as background noise;
 * scripted txs are registered so they are scored like player transactions.
 */
export function createScenarioSession(s: Scenario, over: Partial<GameConfig> = {}): GameSession {
  const ag = createAlpenglow(s.protocol?.ag);
  const tb = createTowerBft(s.protocol?.tb);
  const net = buildNetwork(s);
  const slotMs = slotMsOf(s);
  const session = new GameSession({
    net,
    protocols: [ag, tb],
    primary: "ag",
    seed: s.seed,
    result: agResult,
    config: {
      slotMs,
      durationMs: s.durationMs,
      ...s.game,
      ...over,
      tx: { slotMs, ...s.txConfig, ...s.game?.tx, ...over?.tx },
    },
  });
  injectFaults(session.engine, resolveFaults(net, s.faults, slotMs));
  for (const spec of s.txs) session.game.txs.push({ spec, scored: false });
  return session;
}
