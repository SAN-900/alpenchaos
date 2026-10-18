
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


const rooms = new Map<string, StoredSession>();

export function registerRoom(
  roomId: string,
  room: Omit<StoredSession, "history">,
): void {
  if (rooms.has(roomId)) {
    throw new Error(`Room already exists: ${roomId}`);
  }

  rooms.set(roomId, {
    ...room,
    history: [],
  });
}

export function getRoom(
  roomId: string,
): StoredSession | undefined {
  return rooms.get(roomId);
}

export function removeRoom(roomId: string): boolean {
  return rooms.delete(roomId);
}

export function getRoomCount(): number {
  return rooms.size;
}

