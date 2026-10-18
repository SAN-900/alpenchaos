import {
  createScenarioEngine,
  createScenarioSession,
  getScenario,
} from "@alpenchaos/scenarios";
import type { TraceEntry } from "@alpenchaos/shared";
import {
  getRoom,
  registerRoom,
  type SessionRuntime,
} from "./registry";
import { summarizeTrace, type TraceSummary } from "../services/trace-summary";

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

export function createSession(
  sessionId: string,
  scenarioId: string,
) {
  const scenario = getScenario(scenarioId);

  if (!scenario) {
    return undefined;
  }

  const runtime: SessionRuntime =
    scenario.mode === "play"
      ? {
          mode: "play",
          sim: createScenarioSession(scenario),
        }
      : {
          mode: "watch",
          sim: createScenarioEngine(scenario),
        };

  registerRoom(sessionId, {
    scenario,
    runtime,
  });

  return {
    sessionId,
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    mode: runtime.mode,
    simTimeMs: 0,
    status: "created" as const,
  };
}

export function advanceSession(
  sessionId: string,
  durationMs: number,
): AdvanceResult {
  const stored = getRoom(sessionId);

  if (!stored) {
    return {
      error: "SESSION_NOT_FOUND",
      message: "Session does not exist",
    };
  }

  const { scenario, runtime } = stored;
  const currentTime =
    runtime.mode === "watch"
      ? runtime.sim.engine.now
      : runtime.sim.now;

  const targetTime = Math.min(
    currentTime + durationMs,
    scenario.durationMs,
  );

  if (
    targetTime <= currentTime ||
    (runtime.mode === "play" && runtime.sim.game.over)
  ) {
    const traceSummary = summarizeTrace([]);

    return {
    sessionId,
    simTimeMs: currentTime,
    events: traceSummary.sample,
    eventCount: traceSummary.totalEvents,
    traceSummary,
    status: "completed",
    };
  }

  let events: TraceEntry[];

  if (runtime.mode === "watch") {
    const { engine } = runtime.sim;
    const result = engine.runUntil(targetTime);

    if (!result.reachedTarget) {
      return {
        error: "EVENT_LIMIT_REACHED",
        message: "Simulation stopped at its event-processing limit",
        simTimeMs: engine.now,
      };
    }

    events = engine.trace.drain();
  } else {
    try {
      events = runtime.sim.advance(targetTime);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("event storm")
      ) {
        return {
          error: "EVENT_LIMIT_REACHED",
          message: error.message,
          simTimeMs: runtime.sim.now,
        };
      }

      throw error;
    }
  }

  const simTimeMs =
    runtime.mode === "watch"
      ? runtime.sim.engine.now
      : runtime.sim.now;

  const completed =
    simTimeMs >= scenario.durationMs ||
    (runtime.mode === "play" && Boolean(runtime.sim.game.over));

  const traceSummary = summarizeTrace(events);

    return {
    sessionId,
    simTimeMs,
    events: traceSummary.sample,
    eventCount: traceSummary.totalEvents,
    traceSummary,
    status: completed ? "completed" : "running",
    };
}
