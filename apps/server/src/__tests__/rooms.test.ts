import { beforeEach, expect, test } from "vitest";
import {
  actOnSession, advanceSession, createSession, resolveScenario,
} from "../rooms/room";
import {
  IDLE_MS, MAX_SESSIONS, clearSessions, registerRoom, getRoom, roomCount,
} from "../rooms/registry";
import { buildSessionState } from "../rooms/state";

const DAY = new Date("2026-10-17T12:00:00Z");
const DAILY = "daily-2026-10-17";

beforeEach(() => clearSessions());

test("a 30s advance on a busy network completes without hitting the event cap and leaves no trace backlog", () => {
  createSession("a", "baseline");
  const r = advanceSession("a", 30_000);
  if ("error" in r) throw new Error(JSON.stringify(r));
  expect(r.simTimeMs).toBe(30_000);
  expect(r.status).toBe("completed");
  expect(r.eventCount > 100_000).toBe(true);
  const rt = getRoom("a")!.runtime;
  if (rt.mode === "watch") expect(rt.sim.engine.trace.entries.length).toBe(0);
});

test("repeated advances report only their own events (nothing leaks between calls)", () => {
  createSession("a", "baseline");
  const first = advanceSession("a", 1000);
  const second = advanceSession("a", 1000);
  if ("error" in first || "error" in second) throw new Error("unexpected error");
  expect(second.eventCount < first.eventCount * 3).toBe(true);
});

test("the sample surfaces faults and skips instead of 50 message sends", () => {
  createSession("c", "leader-kill");
  const r = advanceSession("c", 5000);
  if ("error" in r) throw new Error("unexpected error");
  const kinds = new Set(r.events.map((e) => e.kind));
  expect(kinds.has("fault:kill")).toBe(true);
  expect(kinds.has("ag:skipped")).toBe(true);
  expect(r.events.length <= 50).toBe(true);
});

test("sample limit is adjustable per request", () => {
  createSession("c", "baseline");
  const r = advanceSession("c", 3000, 200);
  if ("error" in r) throw new Error("unexpected error");
  expect(r.events.length > 50 && r.events.length <= 200).toBe(true);
});

test("sessions are capped: the least recently used one is evicted", () => {
  createSession("keep", "baseline");
  const keep = getRoom("keep", 0)!;
  const { scenario, runtime } = keep;
  for (let i = 0; i < MAX_SESSIONS + 5; i++) registerRoom(`s${i}`, { scenario, runtime }, 1 + i);
  expect(roomCount()).toBe(MAX_SESSIONS);
  expect(getRoom("keep", 1000)).toBe(undefined);          // oldest went first
  expect(getRoom(`s${MAX_SESSIONS + 4}`, 1000) !== undefined).toBe(true);
});

test("idle sessions expire; using a session keeps it alive", () => {
  createSession("a", "baseline");
  const { scenario, runtime } = getRoom("a", 0)!;
  registerRoom("b", { scenario, runtime }, 0);
  expect(getRoom("a", IDLE_MS - 1) !== undefined).toBe(true);     // touches a at IDLE_MS - 1
  expect(getRoom("b", IDLE_MS + 1)).toBe(undefined);               // never touched: expired
  expect(getRoom("a", IDLE_MS + 1) !== undefined).toBe(true);     // still alive thanks to the touch
});

test("daily scenarios resolve for yesterday, today and tomorrow only", () => {
  expect(resolveScenario("baseline", DAY)?.id).toBe("baseline");
  expect(resolveScenario(DAILY, DAY)?.mode).toBe("play");
  expect(resolveScenario("daily-2026-10-16", DAY)?.id).toBe("daily-2026-10-16");
  expect(resolveScenario("daily-2026-10-18", DAY)?.id).toBe("daily-2026-10-18");
  expect(resolveScenario("daily-2026-10-25", DAY)).toBe(undefined);
  expect(resolveScenario("daily-2026-1-17", DAY)).toBe(undefined);
  expect(resolveScenario("nope", DAY)).toBe(undefined);
});

test("play sessions accept actions; roles, modes and ids are enforced", () => {
  expect(createSession("p", DAILY, DAY)?.mode).toBe("play");
  const adv = advanceSession("p", 1000);
  if ("error" in adv) throw new Error("unexpected error");
  expect(adv.simTimeMs).toBe(1000);

  const ok = actOnSession("p", "chaos", { type: "killLeader" });
  expect(ok.ok).toBe(true);
  expect(actOnSession("p", "defender", { type: "killLeader" })).toMatchObject({ ok: false, error: "ACTION_REJECTED" });

  createSession("w", "baseline");
  expect(actOnSession("w", "chaos", { type: "killLeader" })).toMatchObject({ ok: false, error: "NOT_PLAY_MODE" });
  expect(actOnSession("missing", "chaos", { type: "killLeader" })).toMatchObject({ ok: false, error: "SESSION_NOT_FOUND" });
});

test("sub-step advances on a play session make no progress and do not hang", () => {
  createSession("p", DAILY, DAY);
  advanceSession("p", 1000);
  const r = advanceSession("p", 50);
  if ("error" in r) throw new Error("unexpected error");
  expect(r.simTimeMs).toBe(1000);
});

test("state exposes the current slot, its leader and objective progress", () => {
  createSession("p", DAILY, DAY);
  advanceSession("p", 2000);
  actOnSession("p", "chaos", { type: "killLeader" });
  advanceSession("p", 3000);
  const st = buildSessionState("p", getRoom("p")!) as any;
  expect(st.clock.slot).toBe(Math.floor(st.simTimeMs / 400));
  expect(Number.isInteger(st.clock.leader)).toBe(true);
  expect(st.game.objective).toMatchObject({ met: false });
  expect(st.game.objective.progress >= 0 && st.game.objective.progress <= 1).toBe(true);
  expect(Array.isArray(st.game.transactionStatus)).toBe(true);

  createSession("w", "baseline");
  const watch = buildSessionState("w", getRoom("w")!) as any;
  expect("game" in watch).toBe(false);
  expect(watch.clock.slot).toBe(0);
});
