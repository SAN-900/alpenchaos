import { expect, test } from "vitest";
import { dateKey } from "@alpenchaos/scenarios";
import { createApp } from "../app";
import { Hub } from "../realtime/hub";
import { MemoryStore, type MatchRecord } from "../realtime/store";

function fresh() {
  const store = new MemoryStore();
  let n = 0;
  const hub = new Hub({ store, now: Date.now, randomId: () => `id-${++n}` });
  return { store, hub, app: createApp({ hub, store }) };
}
const post = (app: ReturnType<typeof fresh>["app"], path: string, body: unknown) =>
  app.request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
const daily = () => `daily-${dateKey(new Date())}`;

const rec: MatchRecord = {
  id: "match-1", scenarioId: "daily-2026-10-17", roomId: "r1", winner: "chaos", reason: "time up", simMs: 60_000, createdAt: 5,
  longestStallMs: 4000, objectiveMet: true,
  actions: [{ t: 1000, role: "chaos", action: { type: "killLeader" } }],
  players: [{ role: "chaos", name: "Ana", score: 70 }, { role: "defender", name: "Bo", score: 20 }],
};

test("POST /rooms creates a lobby for a play scenario; GET /rooms/:id describes it", async () => {
  const { app } = fresh();
  const res = await post(app, "/rooms", { scenarioId: daily() });
  const body = (await res.json()) as { roomId: string; ws: string };
  expect(res.status).toBe(201);
  expect(body.ws).toBe("/ws/match");
  const info = await app.request(`/rooms/${body.roomId}`);
  expect(info.status).toBe(200);
  expect(await info.json()).toMatchObject({ status: "lobby", seats: { chaos: false, defender: false } });
});

test("POST /rooms refuses watch scenarios, unknown ids and bad bodies", async () => {
  const { app } = fresh();
  expect((await post(app, "/rooms", { scenarioId: "baseline" })).status).toBe(400);
  expect((await post(app, "/rooms", { scenarioId: "nope" })).status).toBe(404);
  expect((await post(app, "/rooms", { scenarioId: "" })).status).toBe(400);
  expect((await post(app, "/rooms", "{broken")).status).toBe(400);
  expect((await app.request("/rooms/missing")).status).toBe(404);
});

test("GET /leaderboard/:scenarioId ranks scores and validates its query", async () => {
  const { app, store } = fresh();
  store.saveMatch(rec);
  const res = await app.request("/leaderboard/daily-2026-10-17?role=chaos&limit=5");
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ rows: [{ name: "Ana", score: 70, matchId: "match-1" }] });
  expect(((await (await app.request("/leaderboard/daily-2026-10-17?role=defender")).json()) as { rows: unknown[] }).rows.length).toBe(1);
  expect((await app.request("/leaderboard/daily-2026-10-17?role=admin")).status).toBe(400);
  expect((await app.request("/leaderboard/daily-2026-10-17?limit=0")).status).toBe(400);
  expect((await app.request("/leaderboard/BAD ID")).status).toBe(400);
});

test("GET /replays lists recent matches and validates its limit", async () => {
  const { app, store } = fresh();
  store.saveMatch(rec);
  const response = await app.request("/replays?limit=10");
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    count: 1,
    replays: [{
      id: "match-1",
      scenarioId: "daily-2026-10-17",
      winner: "chaos",
      players: [
        { role: "chaos", name: "Ana", score: 70 },
        { role: "defender", name: "Bo", score: 20 },
      ],
    }],
  });
  expect((await app.request("/replays?limit=0")).status).toBe(400);
  expect((await app.request("/replays?limit=101")).status).toBe(400);
});

test("GET /replays/:id returns the action log; unknown or malformed ids are 404", async () => {
  const { app, store } = fresh();
  store.saveMatch(rec);
  const res = await app.request("/replays/match-1");
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ scenarioId: "daily-2026-10-17", actions: [{ t: 1000 }] });
  expect((await app.request("/replays/nope")).status).toBe(404);
  expect((await app.request("/replays/a%20b")).status).toBe(404);
});
