
import type { TraceEntry } from "@alpenchaos/shared";
import type { GameSession } from "@alpenchaos/game-rules";
import type { Scenario, ScenarioSim } from "@alpenchaos/scenarios";

export type SessionRuntime =
  | {
      mode: "watch";
      sim: ScenarioSim;
    }
  | {
      mode: "play";
      sim: GameSession;
    };

export type StoredSession = {
  scenario: Scenario;
  runtime: SessionRuntime;
  history: TraceEntry[];
};

const sessions = new Map<string, StoredSession>();

export function createStoredSession(
  sessionId: string,
  session: Omit<StoredSession, "history">,
): void {
  sessions.set(sessionId, {
    ...session,
    history: [],
  });
}

export function getStoredSession(
  sessionId: string,
): StoredSession | undefined {
  return sessions.get(sessionId);
}

export function deleteStoredSession(
  sessionId: string,
): boolean {
  return sessions.delete(sessionId);
}
