import { expect, test } from "vitest";
import { replayMatch } from "@alpenchaos/game-rules";
import { createScenarioSession, dailyScenario, getScenario, type Scenario } from "@alpenchaos/scenarios";
import { Hub, LOBBY_TTL_MS, MAX_CATCHUP_MS, MAX_ERRORS, OVER_KEEP_MS, ABANDON_MS } from "../realtime/hub";
import type { Socket } from "../realtime/match-room";
import { MemoryStore } from "../realtime/store";

class FakeSocket implements Socket {
  msgs: any[] = [];
  closed?: { code?: number; reason?: string };
  constructor(readonly id: string) {}
  send(data: string) { this.msgs.push(JSON.parse(data)); }
  close(code?: number, reason?: string) { this.closed = { code, reason }; }
  of(t: string) { return this.msgs.filter((m) => m.t === t); }
  last(t: string) { const a = this.of(t); return a[a.length - 1]; }
}

const SHORT: Scenario = { ...dailyScenario("2026-10-17"), durationMs: 10_000 };

function setup(over: { scenario?: Scenario; maxRooms?: number } = {}) {
  const store = new MemoryStore();
  let wall = 1_000_000;
  let n = 0;
  const hub = new Hub({
    store, now: () => wall, randomId: () => `id-${++n}`,
    resolve: (id) => (id === "daily" ? (over.scenario ?? SHORT) : getScenario(id)),
    ...(over.maxRooms ? { maxRooms: over.maxRooms } : {}),
  });
  const sock = (id: string) => { const s = new FakeSocket(id); hub.connect(s); return s; };
  const say = (s: FakeSocket, m: unknown) => hub.message(s.id, JSON.stringify(m));
  /** advance wall clock in 100ms ticks, like the server's interval */
  const run = (ms: number) => { for (let t = 0; t < ms; t += 100) { wall += 100; hub.tick(wall); } };
  const room = () => { const r = hub.createRoom("daily"); if (!r.ok) throw new Error(r.error); return r.roomId; };
  const seat = (s: FakeSocket, roomId: string, role: "chaos" | "defender", name: string = role) => { say(s, { t: "join", room: roomId, role, name }); return s.last("joined"); };
  return { hub, store, sock, say, run, room, seat, wall: () => wall, advanceWall: (ms: number) => { wall += ms; } };
}

test("createRoom: only play scenarios, unknown ids and room caps are refused", () => {
  const { hub } = setup({ maxRooms: 2 });
  expect(hub.createRoom("nope")).toEqual({ ok: false, error: "SCENARIO_NOT_FOUND" });
  expect(hub.createRoom("baseline")).toEqual({ ok: false, error: "NOT_PLAY_MODE" });
  expect(hub.createRoom("daily").ok).toBe(true);
  expect(hub.createRoom("daily").ok).toBe(true);
  expect(hub.createRoom("daily")).toEqual({ ok: false, error: "TOO_MANY_ROOMS" });
});

test("two players claim seats, get tokens, and the match starts by itself", () => {
  const { hub, sock, seat, room } = setup();
  const id = room();
  const a = sock("a"), b = sock("b"), w = sock("w");
  const ja = seat(a, id, "chaos", "Ana");
  expect(ja).toMatchObject({ seat: "chaos", name: "Ana", status: "lobby" });
  expect(typeof ja.token).toBe("string");
  expect(ja.scenario.objective !== undefined).toBe(true);
  expect(hub.describeRoom(id)).toMatchObject({ status: "lobby", seats: { chaos: true, defender: false } });

  const jb = seat(b, id, "defender", "Bo");
  expect(jb.token !== ja.token).toBe(true);
  expect(a.of("started").length).toBe(1);
  expect(b.of("started").length).toBe(1);
  expect(hub.describeRoom(id)!.status).toBe("running");

  const jw = seat(w, id, "spectator" as any);
  expect(jw.seat).toBe("spectator");
  expect(jw.token).toBe(undefined);
  expect(jw.status).toBe("running");
  expect(hub.describeRoom(id)!.spectators).toBe(1);
});

test("join errors: unknown room, taken seat, bad token, double join", () => {
  const { sock, say, room, seat } = setup();
  const id = room();
  const a = sock("a"), b = sock("b"), c = sock("c");
  say(a, { t: "join", room: "missing", role: "chaos" });
  expect(a.last("error").code).toBe("ROOM_NOT_FOUND");
  seat(a, id, "chaos");
  say(b, { t: "join", room: id, role: "chaos" });
  expect(b.last("error").code).toBe("SEAT_TAKEN");
  say(c, { t: "join", room: id, token: "nope-token" });
  expect(c.last("error").code).toBe("BAD_TOKEN");
  say(a, { t: "join", room: id, role: "defender" });
  expect(a.last("error").code).toBe("ALREADY_JOINED");
});

test("the server clock drives the match: ticks carry time, a small event sample, scores and energy", () => {
  const { sock, seat, room, run } = setup();
  const id = room();
  const a = sock("a"), b = sock("b");
  seat(a, id, "chaos"); seat(b, id, "defender");
  run(1000);
  const ticks = a.of("tick");
  expect(ticks.length).toBe(10);
  expect(ticks[ticks.length - 1].simTimeMs).toBe(1000);
  expect(ticks.every((t: any) => t.events.length <= 30)).toBe(true);
  expect(ticks[ticks.length - 1].players.chaos.energy > 6).toBe(true);
  expect(ticks[9].state !== undefined).toBe(true);   // full state every 10 ticks
  expect(ticks[0].state).toBe(undefined);
  expect(b.of("tick").length).toBe(10);              // everyone gets the same stream
});

test("a long wall-clock gap can only advance the match by the catch-up cap per tick", () => {
  const { sock, seat, room, run, advanceWall, hub } = setup();
  const id = room();
  const a = sock("a"), b = sock("b");
  seat(a, id, "chaos"); seat(b, id, "defender");
  run(500);
  advanceWall(10_000);
  run(100);
  expect(hub.describeRoom(id)!.simTimeMs <= 500 + 100 + MAX_CATCHUP_MS).toBe(true);
});

test("actions: players act as their own seat; results and feed are delivered; rejects explain why", () => {
  const { sock, say, seat, room, run } = setup();
  const id = room();
  const a = sock("a"), b = sock("b"), w = sock("w");
  seat(a, id, "chaos"); seat(b, id, "defender"); say(w, { t: "join", room: id });
  run(1000);

  say(a, { t: "action", action: { type: "killLeader" } });
  expect(a.last("actionResult")).toMatchObject({ ok: true, cost: 3 });
  expect(b.last("feed").entry.text).toMatch(/crashed leader/);
  expect(w.last("feed").players.chaos.energy < 5).toBe(true);

  say(b, { t: "action", action: { type: "killLeader" } });
  expect(b.last("actionResult")).toMatchObject({ ok: false });
  expect(b.last("actionResult").reason).toMatch(/defender cannot/);

  say(w, { t: "action", action: { type: "killLeader" } });
  expect(w.last("error").code).toBe("NOT_A_PLAYER");
  say(a, { t: "action", action: { type: "nuke" } });
  expect(a.last("error").code).toBe("BAD_ACTION");
});

test("actions are refused before the match starts", () => {
  const { sock, say, seat, room } = setup();
  const id = room();
  const a = sock("a");
  seat(a, id, "chaos");
  say(a, { t: "action", action: { type: "killLeader" } });
  expect(a.last("error").code).toBe("NOT_RUNNING");
});

test("a solo player can start the match without an opponent", () => {
  const { hub, sock, say, seat, room, run } = setup();
  const id = room();
  const a = sock("a");
  seat(a, id, "chaos");
  say(a, { t: "start" });
  run(300);
  expect(hub.describeRoom(id)!.status).toBe("running");
  expect(a.of("tick").length).toBe(3);
  say(a, { t: "start" });
  expect(a.last("error").code).toBe("ALREADY_STARTED");
  const w = sock("w"); say(w, { t: "join", room: id });
  say(w, { t: "start" });
  expect(w.last("error").code).toBe("NOT_A_PLAYER");
});

test("flooding actions is rate limited", () => {
  const { sock, say, seat, room, run } = setup();
  const id = room();
  const a = sock("a"), b = sock("b");
  seat(a, id, "chaos"); seat(b, id, "defender");
  run(100);
  for (let i = 0; i < 14; i++) say(a, { t: "action", action: { type: "killValidator", v: 23 } });
  expect(a.of("error").some((e: any) => e.code === "RATE_LIMITED")).toBe(true);
});

test("garbage input never crashes the hub, and persistent garbage gets the connection closed", () => {
  const { hub, sock } = setup();
  const a = sock("a");
  for (let i = 0; i < MAX_ERRORS; i++) hub.message("a", "not json");
  expect(a.of("error").length).toBe(MAX_ERRORS);
  expect(a.closed?.code).toBe(1008);
  expect(() => hub.message("ghost", "{}")).not.toThrow();
  expect(() => hub.disconnect("ghost")).not.toThrow();
});

test("reconnecting with the seat token reclaims it and replaces the old connection", () => {
  const { hub, sock, say, seat, room, run } = setup();
  const id = room();
  const a = sock("a"), b = sock("b");
  const token = seat(a, id, "chaos", "Ana").token;
  seat(b, id, "defender");
  run(500);

  hub.disconnect("a");
  expect(b.last("presence").seats.chaos).toEqual({ name: "Ana", connected: false });
  const a2 = sock("a2");
  say(a2, { t: "join", room: id, token });
  expect(a2.last("joined")).toMatchObject({ seat: "chaos", name: "Ana", status: "running" });
  expect(b.last("presence").seats.chaos.connected).toBe(true);
  run(200);
  expect(a2.of("tick").length).toBe(2);

  const a3 = sock("a3");
  say(a3, { t: "join", room: id, token });
  expect(a2.last("error").code).toBe("REPLACED");
  expect(a2.closed?.code).toBe(4000);
  expect(a3.last("joined").seat).toBe("chaos");
});

test("a finished match is announced, saved, ranked, and re-simulates to the same scores", () => {
  const { hub, store, sock, say, seat, room, run } = setup();
  const id = room();
  const a = sock("a"), b = sock("b");
  seat(a, id, "chaos", "Ana"); seat(b, id, "defender", "Bo");
  run(1500);
  say(a, { t: "action", action: { type: "killLeader" } });
  run(2000);
  say(b, { t: "action", action: { type: "sendTx", id: "tx-a" } });
  run(8000); // past the 10s limit

  const over = a.last("over");
  expect(over.winner === "chaos" || over.winner === "defender").toBe(true);
  expect(over.reason).toMatch(/time up|stalled/);
  expect(b.of("over").length).toBe(1);
  expect(hub.describeRoom(id)!.status).toBe("over");
  expect(hub.describeRoom(id)!.matchId).toBe(over.matchId);

  const saved = store.getMatch(over.matchId)!;
  expect(saved.scenarioId).toBe(SHORT.id);
  expect(saved.players.map((p) => p.name).sort()).toEqual(["Ana", "Bo"]);
  expect(saved.actions.length).toBe(2);
  expect(store.top(SHORT.id, "chaos", 5)[0]!.name).toBe("Ana");
  expect(typeof saved.objectiveMet).toBe("boolean");

  // determinism: the stored action log rebuilds the same match
  const again = replayMatch(() => createScenarioSession(SHORT), saved.actions, saved.simMs);
  expect(again.game.players.chaos.score).toBe(saved.players.find((p) => p.role === "chaos")!.score);
  expect(again.game.players.defender.score).toBe(saved.players.find((p) => p.role === "defender")!.score);
  expect(again.game.over?.winner).toBe(saved.winner);
});

test("finished rooms stay readable for a while, then close; lobbies and abandoned matches expire", () => {
  const s = setup();
  const finished = s.room();
  const a = s.sock("a"), b = s.sock("b");
  s.seat(a, finished, "chaos"); s.seat(b, finished, "defender");
  s.run(11_000);
  expect(s.hub.describeRoom(finished)!.status).toBe("over");
  s.advanceWall(OVER_KEEP_MS + 1);
  s.hub.tick(s.wall());
  expect(s.hub.describeRoom(finished)).toBe(undefined);
  expect(a.last("closed")).toMatchObject({ reason: "finished" });

  const lobby = s.room();
  const c = s.sock("c");
  s.seat(c, lobby, "chaos");
  s.advanceWall(LOBBY_TTL_MS + 1);
  s.hub.tick(s.wall());
  expect(s.hub.describeRoom(lobby)).toBe(undefined);
  expect(c.last("closed")).toMatchObject({ reason: "lobby expired" });

  const ghost = s.room();
  const d = s.sock("d"), e = s.sock("e");
  s.seat(d, ghost, "chaos"); s.seat(e, ghost, "defender");
  s.run(300);
  s.hub.disconnect("d"); s.hub.disconnect("e");
  s.advanceWall(ABANDON_MS + 1);
  s.hub.tick(s.wall());
  expect(s.hub.describeRoom(ghost)).toBe(undefined);
  expect(s.store.getMatch("anything")).toBe(undefined);   // abandoned matches are not recorded
});
