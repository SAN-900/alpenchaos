import { expect, test } from "vitest";
import { createScenarioSession, dailyScenario, type Scenario } from "@alpenchaos/scenarios";
import { Hub, STATE_SLOT_WINDOW } from "../realtime/hub";
import type { Socket } from "../realtime/match-room";
import { MemoryStore } from "../realtime/store";
import { resolveScenario } from "../rooms/room";
import { buildSessionState } from "../rooms/state";

class Fake implements Socket {
  msgs: any[] = [];
  closed?: { code?: number; reason?: string };
  constructor(readonly id: string) {}
  send(d: string) { this.msgs.push(JSON.parse(d)); }
  close(code?: number, reason?: string) { this.closed = { code, reason }; }
  of(t: string) { return this.msgs.filter((m) => m.t === t); }
  last(t: string) { const a = this.of(t); return a[a.length - 1]; }
}

const SCN: Scenario = { ...dailyScenario("2026-10-17"), durationMs: 20_000 };
function setup() {
  let wall = 1_000_000, n = 0;
  const hub = new Hub({ store: new MemoryStore(), now: () => wall, randomId: () => `id-${++n}`, resolve: () => SCN });
  const sock = (id: string) => { const s = new Fake(id); hub.connect(s); return s; };
  const say = (s: Fake, m: unknown) => hub.message(s.id, JSON.stringify(m));
  const run = (ms: number) => { for (let t = 0; t < ms; t += 100) { wall += 100; hub.tick(wall); } };
  const room = () => { const r = hub.createRoom("x"); if (!r.ok) throw new Error(r.error); return r.roomId; };
  const seat = (s: Fake, id: string, role: "chaos" | "defender") => { say(s, { t: "join", room: id, role }); return s.last("joined"); };
  return { hub, sock, say, run, room, seat, wall: () => wall };
}

test("one room whose simulation throws is closed; other rooms keep running", () => {
  const { hub, sock, run, room, seat } = setup();
  const [a, b, c, d] = [sock("a"), sock("b"), sock("c"), sock("d")];
  const bad = room(), good = room();
  seat(a, bad, "chaos"); seat(b, bad, "defender");
  seat(c, good, "chaos"); seat(d, good, "defender");
  (hub as any).rooms.get(bad).session.advance = () => { throw new Error("event storm: boom"); };

  expect(() => run(300)).not.toThrow();
  expect(a.last("error")).toMatchObject({ code: "SIM_ERROR" });
  expect(a.last("closed")).toMatchObject({ reason: "simulation error" });
  expect(hub.describeRoom(bad)).toBe(undefined);
  expect(c.of("tick").length).toBe(3);          // the healthy room never missed a tick
  expect(hub.describeRoom(good)?.status).toBe("running");
});

test("a lobby seat is freed when its holder leaves, so someone else can take it", () => {
  const { hub, sock, room, seat } = setup();
  const id = room();
  const a = sock("a"), b = sock("b");
  const ja = seat(a, id, "chaos");
  hub.disconnect("a");
  expect(hub.describeRoom(id)?.seats.chaos).toBe(false);
  expect(seat(b, id, "chaos")).toMatchObject({ seat: "chaos" });
  // the old token no longer works
  const a2 = sock("a2");
  hub.message("a2", JSON.stringify({ t: "join", room: id, token: ja.token }));
  expect(a2.last("error")).toMatchObject({ code: "BAD_TOKEN" });
});

test("a running match still holds the seat for a reconnect", () => {
  const { hub, sock, room, seat, run } = setup();
  const id = room();
  seat(sock("a"), id, "chaos"); seat(sock("b"), id, "defender");
  run(300);
  hub.disconnect("a");
  expect(hub.describeRoom(id)?.seats.chaos).toBe(true);
});

test("every message type is rate limited, not just actions", () => {
  const { hub, sock, say, wall } = setup();
  const a = sock("a");
  for (let i = 0; i < 200; i++) say(a, { t: "ping" });
  expect(a.of("pong").length).toBeLessThan(60);
  expect(a.of("error").some((e) => e.code === "RATE_LIMITED")).toBe(true);
  void hub; void wall;
});

test("old dailies resolve for viewing/replay but cannot be used to start new matches", () => {
  const now = new Date("2026-10-18T12:00:00Z");
  expect(resolveScenario("daily-2026-10-11", now)).toBe(undefined);                          // cannot start
  expect(resolveScenario("daily-2026-10-11", now, { anyPastDate: true })?.id).toBe("daily-2026-10-11");
  expect(resolveScenario("daily-2026-10-17", now)?.id).toBe("daily-2026-10-17");            // yesterday still fine
  expect(resolveScenario("daily-2027-01-01", now, { anyPastDate: true })).toBe(undefined);   // future is never allowed
  expect(resolveScenario("daily-2026-13-45", now, { anyPastDate: true })).toBe(undefined);   // nonsense date
});

test("windowed state keeps full counts but bounds the slot lists", () => {
  const s = createScenarioSession({ ...SCN, durationMs: 60_000 });
  s.advance(40_000);
  const wrap = { scenario: SCN, runtime: { mode: "play" as const, sim: s }, history: [], lastUsed: 0 };
  const full = buildSessionState("x", wrap);
  const win = buildSessionState("x", wrap, { slotWindow: STATE_SLOT_WINDOW });
  expect(win.consensus.alpenglow.finalized).toBe(full.consensus.alpenglow.finalized);
  expect(win.consensus.alpenglow.skipped).toBe(full.consensus.alpenglow.skipped);
  expect(full.consensus.alpenglow.slots.length).toBeGreaterThan(STATE_SLOT_WINDOW);
  expect(win.consensus.alpenglow.slots.length).toBeLessThanOrEqual(STATE_SLOT_WINDOW);
  expect(JSON.stringify(win).length).toBeLessThan(JSON.stringify(full).length);
});
