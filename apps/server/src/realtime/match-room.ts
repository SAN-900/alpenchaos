import type { GameSession, Role } from "@alpenchaos/game-rules";
import type { Scenario } from "@alpenchaos/scenarios";

export type Socket = { id: string; send(data: string): void; close(code?: number, reason?: string): void };

export type Seat = { role: Role; token: string; name: string; sock?: Socket };

/**
 * One live match: two seats (chaos, defender), any number of spectators, and
 * the authoritative GameSession. The hub drives it; it holds no timers.
 */
export class MatchRoom {
  status: "lobby" | "running" | "over" = "lobby";
  seats: Partial<Record<Role, Seat>> = {};
  spectators = new Map<string, Socket>();
  /** Wall-clock ms at which simulated time was 0 (set when the match starts). */
  startReal = 0;
  tickCount = 0;
  matchId?: string;
  overReal?: number;
  lastSocketReal: number;

  constructor(
    readonly id: string,
    readonly scenario: Scenario,
    readonly session: GameSession,
    readonly createdReal: number,
  ) {
    this.lastSocketReal = createdReal;
  }

  sockets(): Socket[] {
    const out: Socket[] = [];
    for (const s of Object.values(this.seats)) if (s?.sock) out.push(s.sock);
    for (const s of this.spectators.values()) out.push(s);
    return out;
  }

  broadcast(obj: unknown): void {
    const data = JSON.stringify(obj);
    for (const s of this.sockets()) {
      try {
        s.send(data);
      } catch {
        /* a dead socket is cleaned up by its close event */
      }
    }
  }
}
