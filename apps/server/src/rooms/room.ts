import {
  createScenarioEngine,
  createScenarioSession,
  dailyScenario,
  dateKey,
  getScenario,
  type Scenario,
} from "@alpenchaos/scenarios";
import type { Action, Role } from "@alpenchaos/game-rules";
import type { TraceEntry } from "@alpenchaos/shared";
import {
  getRoom,
  registerRoom,
  removeRoom,
  type SessionRuntime,
} from "./registry";
import { DEFAULT_SAMPLE_LIMIT, TraceAccumulator, type TraceSummary } from "../services/trace-summary";

/** Simulate in slices this long, draining the trace between them, so one big request never hits the engine's event cap. */
export const SLICE_MS = 2_000;

export type AdvanceResult =
  | {
      sessionId: string;
      simTimeMs: number;
      events: TraceEntry[];
      eventCount: number;
      traceSummary: TraceSummary;
      status: "running" | "completed";
    }
  | {
      error: "SESSION_NOT_FOUND";
      message: string;
    }
  | {
      error: "UNSUPPORTED_MODE";
      message: string;
    }
  | {
      error: "EVENT_LIMIT_REACHED";
      message: string;
      simTimeMs: number;
    };


export type ActOutcome =
  | { ok: true; cost: number; simTimeMs: number }
  | { ok: false; error: "SESSION_NOT_FOUND" | "NOT_PLAY_MODE" | "ACTION_REJECTED"; message: string };


export function resolveScenario(id: string, now: Date = new Date()): Scenario | undefined {
  const preset = getScenario(id);
  if (preset) return preset;
  const m = /^daily-(\d{4}-\d{2}-\d{2})$/.exec(id);
  if (!m) return undefined;
  const DAY = 86_400_000;
  const allowed = [-1, 0, 1].map((d) => dateKey(new Date(now.getTime() + d * DAY)));
  return allowed.includes(m[1]!) ? dailyScenario(m[1]!) : undefined;
}

export function createSession(sessionId: string, scenarioId: string, now: Date = new Date()) {
  const scenario = resolveScenario(scenarioId, now);
  if (!scenario) return undefined;

  const runtime: SessionRuntime =
    scenario.mode === "play"
      ? { mode: "play", sim: createScenarioSession(scenario) }
      : { mode: "watch", sim: createScenarioEngine(scenario) };

  registerRoom(sessionId, { scenario, runtime });

  return {
    sessionId,
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    mode: runtime.mode,
    simTimeMs: 0,
    status: "created" as const,
  };
}

const nowOf = (r: SessionRuntime): number => (r.mode === "watch" ? r.sim.engine.now : r.sim.now);
const isOver = (r: SessionRuntime): boolean => r.mode === "play" && Boolean(r.sim.game.over);



export function advanceSession(
  sessionId: string,
  durationMs: number,
  sampleLimit: number = DEFAULT_SAMPLE_LIMIT,
): AdvanceResult {
  const stored = getRoom(sessionId);
  if (!stored) return { error: "SESSION_NOT_FOUND", message: "Session does not exist" };

  const { scenario, runtime } = stored;
  const start = nowOf(runtime);
  const target = Math.min(start + durationMs, scenario.durationMs);
  const acc = new TraceAccumulator(sampleLimit);

  let t = start;
  while (t < target && !isOver(runtime)) {
    const next = Math.min(t + SLICE_MS, target);

    if (runtime.mode === "watch") {
      const { engine } = runtime.sim;
      const r = engine.runUntil(next);
      acc.add(engine.trace.drain()); // always drain, even on failure, so nothing piles up for the next call
      if (!r.reachedTarget) {
        return {
          error: "EVENT_LIMIT_REACHED",
          message: "Simulation stopped at its event-processing limit",
          simTimeMs: engine.now,
        };
      }
    } else {
      try {
        acc.add(runtime.sim.advance(next));
      } catch (error) {
        if (error instanceof Error && error.message.includes("event storm")) {
          return { error: "EVENT_LIMIT_REACHED", message: error.message, simTimeMs: runtime.sim.now };
        }
        throw error;
      }
    }

    const now = nowOf(runtime);
    if (now <= t) break; // no progress (play sessions only move in whole sim steps)
    t = now;
  }

  const simTimeMs = nowOf(runtime);
  const traceSummary = acc.finish();
  return {
    sessionId,
    simTimeMs,
    events: traceSummary.sample,
    eventCount: traceSummary.totalEvents,
    traceSummary,
    status: simTimeMs >= scenario.durationMs || isOver(runtime) ? "completed" : "running",
  };
}

/** Apply a player action in a play-mode session at the current sim time. */
export function actOnSession(sessionId: string, role: Role, action: Action): ActOutcome {
  const stored = getRoom(sessionId);
  if (!stored) return { ok: false, error: "SESSION_NOT_FOUND", message: "Session does not exist" };
  if (stored.runtime.mode !== "play") {
    return { ok: false, error: "NOT_PLAY_MODE", message: "Only play-mode sessions accept actions" };
  }
  const r = stored.runtime.sim.act(role, action);
  if (!r.ok) return { ok: false, error: "ACTION_REJECTED", message: r.reason };
  return { ok: true, cost: r.cost, simTimeMs: stored.runtime.sim.now };
}

export const deleteSession = (sessionId: string): boolean => removeRoom(sessionId);
