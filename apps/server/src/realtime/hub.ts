import { energyUnits, type Role } from "@alpenchaos/game-rules";
import { createScenarioSession, evaluateObjective, type Scenario } from "@alpenchaos/scenarios";
import { parseActionBody } from "../http/validate";
import { resolveScenario } from "../rooms/room";
import { buildSessionState } from "../rooms/state";
import { summarizeTrace } from "../services/trace-summary";
import { MatchRoom, type Seat, type Socket } from "./match-room";
import { parseClientMessage } from "./protocol";
import { TokenBucket } from "./ratelimit";
import type { MatchRecord, Store } from "./store";

export const LOBBY_TTL_MS = 10 * 60_000;
export const OVER_KEEP_MS = 5 * 60_000;
export const ABANDON_MS = 2 * 60_000;
export const STATE_EVERY_TICKS = 10;
export const MAX_SPECTATORS = 50;
export const MAX_CATCHUP_MS = 1000;
export const TICK_SAMPLE = 30;
export const MAX_ERRORS = 10;

export type HubOptions = {
  store: Store;
  /** Wall clock in ms. Injected so tests control time. */
  now: () => number;
  randomId: () => string;
  resolve?: (scenarioId: string) => Scenario | undefined;
  maxRooms?: number;
};

type Conn = { sock: Socket; roomId?: string; seat?: Role | "spectator"; limiter: TokenBucket; flood: TokenBucket; errors: number };

/** How many recent slots the periodic full-state snapshot carries (counts still cover the whole match). */
export const STATE_SLOT_WINDOW = 60;

export type CreateRoomResult =
  | { ok: true; roomId: string }
  | { ok: false; error: "SCENARIO_NOT_FOUND" | "NOT_PLAY_MODE" | "TOO_MANY_ROOMS" };

export type RoomInfo = {
  id: string;
  scenarioId: string;
  status: "lobby" | "running" | "over";
  seats: { chaos: boolean; defender: boolean };
  spectators: number;
  simTimeMs: number;
  matchId?: string;
};

/**
 * Realtime hub: owns rooms and connections, speaks the JSON protocol, and
 * drives every running match from one wall-clock tick. Transport-agnostic:
 * sockets are just { id, send, close }, so it runs under Bun's WebSocket in
 * production and under fakes in tests.
 */
export class Hub {
  private rooms = new Map<string, MatchRoom>();
  private conns = new Map<string, Conn>();

  constructor(private o: HubOptions) {}

  // ---- rooms -------------------------------------------------------------

  createRoom(scenarioId: string): CreateRoomResult {
    const scenario = (this.o.resolve ?? resolveScenario)(scenarioId);
    if (!scenario) return { ok: false, error: "SCENARIO_NOT_FOUND" };
    if (scenario.mode !== "play") return { ok: false, error: "NOT_PLAY_MODE" };
    if (this.rooms.size >= (this.o.maxRooms ?? 100)) return { ok: false, error: "TOO_MANY_ROOMS" };

    let id = "";
    for (let i = 0; i < 5 && (id === "" || this.rooms.has(id)); i++) id = this.o.randomId().replace(/-/g, "").slice(0, 8);
    if (this.rooms.has(id)) return { ok: false, error: "TOO_MANY_ROOMS" };

    this.rooms.set(id, new MatchRoom(id, scenario, createScenarioSession(scenario), this.o.now()));
    return { ok: true, roomId: id };
  }

  describeRoom(id: string): RoomInfo | undefined {
    const r = this.rooms.get(id);
    if (!r) return undefined;
    return {
      id: r.id,
      scenarioId: r.scenario.id,
      status: r.status,
      seats: { chaos: Boolean(r.seats.chaos), defender: Boolean(r.seats.defender) },
      spectators: r.spectators.size,
      simTimeMs: r.session.now,
      ...(r.matchId ? { matchId: r.matchId } : {}),
    };
  }

  roomCount = (): number => this.rooms.size;

  // ---- connections -------------------------------------------------------

  connect(sock: Socket): void {
    this.conns.set(sock.id, { sock, limiter: new TokenBucket(10, 5, this.o.now()), flood: new TokenBucket(40, 20, this.o.now()), errors: 0 });
  }

  disconnect(sockId: string): void {
    const conn = this.conns.get(sockId);
    this.conns.delete(sockId);
    const room = conn?.roomId ? this.rooms.get(conn.roomId) : undefined;
    if (!conn || !room) return;
    room.lastSocketReal = this.o.now();
    if (conn.seat === "spectator") room.spectators.delete(sockId);
    else if (conn.seat) {
      const seat = room.seats[conn.seat];
      if (seat?.sock?.id === sockId) {
        delete seat.sock;
        // Before the match starts nothing is at stake, so free the seat instead of locking
        // it behind a token the player may have lost (page refresh, closed tab).
        if (room.status === "lobby") delete room.seats[conn.seat];
      }
    }
    room.broadcast({ t: "presence", seats: this.presence(room), spectators: room.spectators.size });
  }

  message(sockId: string, raw: string): void {
    const conn = this.conns.get(sockId);
    if (!conn) return;
    // Cheap frames (ping, bad JSON, failed joins) can still be flooded, so every message costs a token.
    if (!conn.flood.take(this.o.now())) return this.fail(conn, "RATE_LIMITED", "slow down");
    const parsed = parseClientMessage(raw);
    if (!parsed.ok) return this.fail(conn, parsed.code, parsed.message);
    const msg = parsed.msg;

    switch (msg.t) {
      case "ping":
        return this.send(conn, { t: "pong", serverTime: this.o.now() });
      case "join":
        return this.join(conn, msg);
      case "start": {
        const room = this.roomOf(conn);
        if (!room) return this.fail(conn, "NOT_IN_ROOM", "join a room first");
        if (conn.seat === "spectator") return this.fail(conn, "NOT_A_PLAYER", "spectators cannot start a match");
        if (room.status !== "lobby") return this.fail(conn, "ALREADY_STARTED", "match already started");
        return this.startRoom(room);
      }
      case "action":
        return this.action(conn, msg.action);
    }
  }

  // ---- clock -------------------------------------------------------------

  /** Call every ~100ms with the wall clock. Advances running matches and expires idle ones. */
  tick(now: number): void {
    for (const room of [...this.rooms.values()]) {
      if (room.status === "lobby") {
        if (now - room.createdReal > LOBBY_TTL_MS) this.removeRoom(room, "lobby expired");
      } else if (room.status === "running") {
        if (room.sockets().length === 0 && now - room.lastSocketReal > ABANDON_MS) {
          this.removeRoom(room, "abandoned");
        } else {
          try {
            this.stepRoom(room, now);
          } catch (e) {
            this.failRoom(room, e);
          }
        }
      } else if (room.overReal !== undefined && now - room.overReal > OVER_KEEP_MS) {
        this.removeRoom(room, "finished");
      }
    }
  }

  // ---- internals ---------------------------------------------------------

  private roomOf(conn: Conn): MatchRoom | undefined {
    return conn.roomId ? this.rooms.get(conn.roomId) : undefined;
  }

  private send(conn: Conn, obj: unknown): void {
    try {
      conn.sock.send(JSON.stringify(obj));
    } catch {
      /* closed; its close event cleans up */
    }
  }

  private fail(conn: Conn, code: string, message: string): void {
    this.send(conn, { t: "error", code, message });
    if (++conn.errors >= MAX_ERRORS) conn.sock.close(1008, "too many errors");
  }

  private presence(room: MatchRoom) {
    return {
      chaos: room.seats.chaos ? { name: room.seats.chaos.name, connected: Boolean(room.seats.chaos.sock) } : null,
      defender: room.seats.defender ? { name: room.seats.defender.name, connected: Boolean(room.seats.defender.sock) } : null,
    };
  }

  private stateOf(room: MatchRoom) {
  return buildSessionState(room.id, {
    scenario: room.scenario,
    runtime: { mode: "play", sim: room.session },
    history: [],
    lastUsed: 0,
  }, { slotWindow: STATE_SLOT_WINDOW });
}

  private playersOf(room: MatchRoom) {
    const g = room.session.game;
    const row = (r: Role) => ({ score: g.players[r].score, energy: Math.floor(energyUnits(g.players[r], g.cfg, room.session.now) * 10) / 10 });
    return { chaos: row("chaos"), defender: row("defender") };
  }

  private join(conn: Conn, m: { room: string; role?: Role | "spectator"; token?: string; name?: string }): void {
    if (conn.roomId) return this.fail(conn, "ALREADY_JOINED", "this connection already joined a room");
    const room = this.rooms.get(m.room);
    if (!room) return this.fail(conn, "ROOM_NOT_FOUND", "no such room");
    const name = m.name ?? "player";
    let seat: Seat | undefined;

    if (m.token) {
      seat = Object.values(room.seats).find((s) => s?.token === m.token);
      if (!seat) return this.fail(conn, "BAD_TOKEN", "that seat token is not valid for this room");
      const old = seat.sock;
      if (old && old.id !== conn.sock.id) {
        try {
          old.send(JSON.stringify({ t: "error", code: "REPLACED", message: "this seat was claimed by another connection" }));
        } catch {
          /* already closed */
        }
        const oc = this.conns.get(old.id);
        if (oc) delete oc.roomId;
        old.close(4000, "replaced");
      }
      seat.sock = conn.sock;
    } else if (m.role === "chaos" || m.role === "defender") {
      if (room.status === "over") return this.fail(conn, "ROOM_OVER", "the match has finished");
      if (room.seats[m.role]) return this.fail(conn, "SEAT_TAKEN", `${m.role} is already taken`);
      seat = { role: m.role, token: this.o.randomId(), name, sock: conn.sock };
      room.seats[m.role] = seat;
    } else {
      if (room.spectators.size >= MAX_SPECTATORS) return this.fail(conn, "ROOM_FULL", "too many spectators");
      room.spectators.set(conn.sock.id, conn.sock);
    }

    conn.roomId = room.id;
    conn.seat = seat ? seat.role : "spectator";
    room.lastSocketReal = this.o.now();
    const s = room.scenario;
    this.send(conn, {
      t: "joined",
      room: room.id,
      seat: conn.seat,
      ...(seat ? { token: seat.token } : {}),
      name: seat?.name ?? name,
      status: room.status,
      scenario: {
        id: s.id, name: s.name, tagline: s.tagline, description: s.description, lesson: s.lesson,
        difficulty: s.difficulty, mode: s.mode, durationMs: s.durationMs,
        objective: s.objective ?? null, annotations: s.annotations,
      },
      state: this.stateOf(room),
      players: this.playersOf(room),
    });
    room.broadcast({ t: "presence", seats: this.presence(room), spectators: room.spectators.size });

    if (room.status === "lobby" && room.seats.chaos && room.seats.defender) this.startRoom(room);
  }

  private startRoom(room: MatchRoom): void {
    room.status = "running";
    room.startReal = this.o.now() - room.session.now;
    room.broadcast({ t: "started", simTimeMs: room.session.now });
  }

  private action(conn: Conn, rawAction: unknown): void {
    const room = this.roomOf(conn);
    if (!room) return this.fail(conn, "NOT_IN_ROOM", "join a room first");
    if (!conn.seat || conn.seat === "spectator") return this.fail(conn, "NOT_A_PLAYER", "spectators cannot act");
    if (room.status !== "running") return this.fail(conn, "NOT_RUNNING", "the match is not running");
    if (!conn.limiter.take(this.o.now())) return this.fail(conn, "RATE_LIMITED", "slow down");

    const parsed = parseActionBody({ role: conn.seat, action: rawAction });
    if (!parsed.ok) return this.fail(conn, "BAD_ACTION", parsed.message);

    const r = room.session.act(conn.seat, parsed.value.action);
    this.send(conn, r.ok
      ? { t: "actionResult", ok: true, cost: r.cost, simTimeMs: room.session.now }
      : { t: "actionResult", ok: false, reason: r.reason, simTimeMs: room.session.now });
    if (r.ok) {
      const entry = room.session.game.feed[room.session.game.feed.length - 1];
      room.broadcast({ t: "feed", entry, players: this.playersOf(room) });
    }
  }

  private stepRoom(room: MatchRoom, now: number): void {
    const session = room.session;
    const target = Math.min(now - room.startReal, session.now + MAX_CATCHUP_MS);
    const entries = session.advance(target);
    room.tickCount++;

    const summary = summarizeTrace(entries, TICK_SAMPLE);
    const g = session.game;
    room.broadcast({
      t: "tick",
      simTimeMs: session.now,
      events: summary.sample,
      counts: summary.byKind,
      players: this.playersOf(room),
      stallMs: g.stallMs,
      ...(room.tickCount % STATE_EVERY_TICKS === 0 ? { state: this.stateOf(room) } : {}),
    });

    if (g.over) this.finish(room, now);
  }

  private finish(room: MatchRoom, now: number): void {
    const g = room.session.game;
    const over = g.over!;
    room.status = "over";
    room.overReal = now;
    room.matchId = this.o.randomId();

    const players = (["chaos", "defender"] as const)
      .filter((r) => room.seats[r])
      .map((r) => ({ role: r, name: room.seats[r]!.name, score: g.players[r].score }));
    const record: MatchRecord = {
      id: room.matchId,
      scenarioId: room.scenario.id,
      roomId: room.id,
      winner: over.winner,
      reason: over.reason,
      simMs: over.at,
      createdAt: now,
      longestStallMs: g.longestStallMs,
      objectiveMet: room.scenario.objective ? evaluateObjective(g, room.scenario.objective).met : null,
      actions: structuredClone(g.actions),
      players,
    };
    if (players.length > 0) {
      try {
        this.o.store.saveMatch(record);
      } catch (e) {
        console.error("failed to save match", e);
      }
    }
    room.broadcast({
      t: "over",
      winner: over.winner,
      reason: over.reason,
      matchId: room.matchId,
      players: this.playersOf(room),
      objectiveMet: record.objectiveMet,
      state: this.stateOf(room),
    });
  }

  /** A simulation that throws (e.g. the engine's event-storm guard) ends that room only. Nothing is saved. */
  private failRoom(room: MatchRoom, e: unknown): void {
    console.error(`room ${room.id} failed`, e);
    room.broadcast({ t: "error", code: "SIM_ERROR", message: "the simulation failed; this match was closed" });
    this.removeRoom(room, "simulation error");
  }

  private removeRoom(room: MatchRoom, why: string): void {
    room.broadcast({ t: "closed", reason: why });
    for (const s of room.sockets()) {
      const c = this.conns.get(s.id);
      if (c) delete c.roomId;
      try {
        s.close(1000, why);
      } catch {
        /* already closed */
      }
    }
    this.rooms.delete(room.id);
  }
}
