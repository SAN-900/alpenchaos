
import { leaderForSlot } from "@alpenchaos/network-simulator";
import type { WorldState } from "@alpenchaos/network-simulator";
import type { AlpenglowState } from "@alpenchaos/protocol-alpenglow";
import { evaluateObjective, slotMsOf } from "@alpenchaos/scenarios";
import type { TowerBftState } from "@alpenchaos/protocol-legacy";
import type { StoredSession } from "./registry";

function summarizeSlots(
  slots: Record<
    string,
    {
      status: "finalized" | "skipped";
      at: number;
      by: number;
      latencyMs: number;
      path?: "fast" | "slow";
    }
  >,
) {
  return Object.entries(slots)
    .map(([slot, result]) => ({
      slot: Number(slot),
      ...result,
    }))
    .sort((a, b) => a.slot - b.slot);
}

export type StateOptions = {
  /**
   * Keep only the newest N slots in the `slots` lists. Counts (finalized, skipped,
   * fast/slow) always cover the whole match. Without this the payload grows with
   * match length, which matters when it is re-sent to every client every second.
   */
  slotWindow?: number;
};

export function buildSessionState(
  sessionId: string,
  stored: StoredSession,
  opts: StateOptions = {},
) {
  const runtime = stored.runtime;
  const engine =
    runtime.mode === "watch"
      ? runtime.sim.engine
      : runtime.sim.engine;

  const world = engine.state as WorldState;
  const ag = world.protocols["ag"] as AlpenglowState;
  const tb = world.protocols["tb"] as TowerBftState;

  const alpenglowSlots = summarizeSlots(ag.global);
  const towerSlots = summarizeSlots(tb.global);

  const game =
    runtime.mode === "play"
      ? runtime.sim.game
      : undefined;

  const completed =
    engine.now >= stored.scenario.durationMs ||
    Boolean(game?.over);

  const currentSlot = Math.floor(engine.now / slotMsOf(stored.scenario));
  const recent = <T extends { slot: number }>(xs: T[]): T[] =>
    opts.slotWindow === undefined ? xs : xs.filter((s) => s.slot > currentSlot - opts.slotWindow!);

  return {
    sessionId,
    scenario: {
      id: stored.scenario.id,
      name: stored.scenario.name,
      mode: stored.scenario.mode,
      durationMs: stored.scenario.durationMs,
    },
    status: completed ? "completed" : "running",
    simTimeMs: engine.now,
    clock: {
      slot: currentSlot,
      leader: leaderForSlot(world.net, currentSlot),
    },
    network: {
      totalStake: world.net.totalStake,
      lossRate: world.net.lossRate,
      validators: world.net.validators.map(
        (validator, index) => ({
          id: validator.id,
          stake: validator.stake,
          up: validator.up,
          region: validator.region,
          partitionGroup: world.net.group[index],
          extraDelayMs: world.net.extraDelay[index],
        }),
      ),
    },
    consensus: {
      alpenglow: {
        finalized: alpenglowSlots.filter(
          (slot) => slot.status === "finalized",
        ).length,
        skipped: alpenglowSlots.filter(
          (slot) => slot.status === "skipped",
        ).length,
        fastPath: alpenglowSlots.filter(
          (slot) => slot.path === "fast",
        ).length,
        slowPath: alpenglowSlots.filter(
          (slot) => slot.path === "slow",
        ).length,
        slots: recent(alpenglowSlots),
      },
      towerBft: {
        finalized: towerSlots.filter(
          (slot) => slot.status === "finalized",
        ).length,
        skipped: towerSlots.filter(
          (slot) => slot.status === "skipped",
        ).length,
        optimisticConfirmations: recent(
          Object.entries(tb.optimistic)
            .map(([slot, result]) => ({
              slot: Number(slot),
              ...result,
            }))
            .sort((a, b) => a.slot - b.slot),
        ),
        slots: recent(towerSlots),
      },
    },
    ...(game
      ? {
          game: {
            over: game.over ?? null,
            players: game.players,
            frontier: game.frontier,
            stallMs: game.stallMs,
            longestStallMs: game.longestStallMs,
            totalStallMs: game.totalStallMs,
            transactions: game.txs.length,
            transactionStatus: game.txs.map((t) => ({
              id: t.spec.id,
              status: t.outcome?.status ?? "pending",
            })),
            objective: stored.scenario.objective
              ? evaluateObjective(game, stored.scenario.objective)
              : null,
            actions: game.actions.length,
            feed: game.feed.slice(-20),
          },
        }
      : {}),
  };
}
