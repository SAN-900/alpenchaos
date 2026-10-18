
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
  lastUsed: number;
  history: TraceEntry[];
};

/** Sessions live in memory, so bound them: cap the count and drop idle ones. */
export const MAX_SESSIONS = 200;
export const IDLE_MS = 30 * 60_000;

const rooms = new Map<string, StoredSession>();

export function sweep(now = Date.now()): number {
  let removed = 0;
  for (const [id, s] of rooms) {
    if (now - s.lastUsed > IDLE_MS) {
      rooms.delete(id);
      removed++;
    }
  }
  return removed;
}

export function registerRoom(
  roomId: string,
  room: Pick<StoredSession, "scenario" | "runtime">,
  now = Date.now(),
): void {
  sweep(now);
  while (rooms.size >= MAX_SESSIONS) {
    let oldest: string | undefined;
    let oldestAt = Infinity;
    for (const [id, s] of rooms) {
      if (s.lastUsed < oldestAt) {
        oldest = id;
        oldestAt = s.lastUsed;
      }
    }
    if (oldest === undefined) break;
    rooms.delete(oldest);
  }
  rooms.set(roomId, {
    ...room,
    lastUsed: now,
    history: [],
  });
}

export function getRoom(sessionId: string, now = Date.now()): StoredSession | undefined {
  const s = rooms.get(sessionId);
  if (!s) return undefined;
  if (now - s.lastUsed > IDLE_MS) {
    rooms.delete(sessionId);
    return undefined;
  }
  s.lastUsed = now;
  return s;
}

export function removeRoom(roomId: string): boolean {
  return rooms.delete(roomId);
}

export const roomCount = (): number => rooms.size;
export function clearSessions(): void {
  rooms.clear();
}

