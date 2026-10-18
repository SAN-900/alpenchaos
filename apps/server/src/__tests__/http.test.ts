import { beforeEach, expect, test } from "vitest";
import { dateKey } from "@alpenchaos/scenarios";
import { app } from "../app";
import { clearSessions } from "../rooms/registry";

const post = (path: string, body: unknown) =>
  app.request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
const create = async (scenarioId: string) => (await (await post("/sessions", { scenarioId })).json()) as { sessionId: string; mode: string };

beforeEach(() => clearSessions());

test("GET /scenarios/daily returns today's play-mode challenge, and it can be played", async () => {
  const res = await app.request("/scenarios/daily");
  const body = (await res.json()) as { date: string; scenario: { id: string; mode: string } };
  expect(res.status).toBe(200);
  expect(body.date).toBe(dateKey(new Date()));
  expect(body.scenario.mode).toBe("play");
  const session = await create(body.scenario.id);
  expect(session.mode).toBe("play");
});

test("GET /scenarios/:id returns the full scenario; unknown ids are 404", async () => {
  const ok = await app.request("/scenarios/baseline");
  expect(ok.status).toBe(200);
  expect(await ok.json()).toHaveProperty("annotations");
  expect((await app.request("/scenarios/nope")).status).toBe(404);
});

test("POST /sessions/:id/actions: accepted, rejected, wrong mode, bad input", async () => {
  const daily = (await (await app.request("/scenarios/daily")).json()) as { scenario: { id: string } };
  const play = await create(daily.scenario.id);
  await post(`/sessions/${play.sessionId}/advance`, { durationMs: 1000 });

  const accepted = await post(`/sessions/${play.sessionId}/actions`, { role: "chaos", action: { type: "killLeader" } });
  expect(accepted.status).toBe(200);
  expect(await accepted.json()).toMatchObject({ ok: true, cost: 3 });

  const rejected = await post(`/sessions/${play.sessionId}/actions`, { role: "defender", action: { type: "killLeader" } });
  expect(rejected.status).toBe(422);
  expect(await rejected.json()).toMatchObject({ error: "ACTION_REJECTED" });

  expect((await post(`/sessions/${play.sessionId}/actions`, { role: "chaos", action: { type: "nuke" } })).status).toBe(400);
  expect((await post(`/sessions/${play.sessionId}/actions`, "{not json")).status).toBe(400);

  const watch = await create("baseline");
  expect((await post(`/sessions/${watch.sessionId}/actions`, { role: "chaos", action: { type: "killLeader" } })).status).toBe(409);
  expect((await post("/sessions/missing/actions", { role: "chaos", action: { type: "killLeader" } })).status).toBe(404);
});

test("advance accepts a larger sample limit; a 30s advance succeeds", async () => {
  const s = await create("baseline");
  const res = await post(`/sessions/${s.sessionId}/advance`, { durationMs: 30_000, limit: 200 });
  const body = (await res.json()) as { status: string; events: unknown[]; simTimeMs: number };
  expect(res.status).toBe(200);
  expect(body.simTimeMs).toBe(30_000);
  expect(body.status).toBe("completed");
  expect(body.events.length <= 200).toBe(true);
});

test("DELETE /sessions/:id removes the session", async () => {
  const s = await create("baseline");
  expect((await app.request(`/sessions/${s.sessionId}`, { method: "DELETE" })).status).toBe(204);
  expect((await app.request(`/sessions/${s.sessionId}`)).status).toBe(404);
  expect((await app.request(`/sessions/${s.sessionId}`, { method: "DELETE" })).status).toBe(404);
});

test("CORS allows the configured web origin", async () => {
  const res = await app.request("/scenarios", { headers: { Origin: "http://localhost:3000" } });
  expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
  const pre = await app.request("/sessions", {
    method: "OPTIONS",
    headers: { Origin: "http://localhost:3000", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" },
  });
  expect(pre.status).toBe(204);
});

test("oversized request bodies are refused", async () => {
  const res = await post("/sessions", { scenarioId: "baseline", pad: "x".repeat(70_000) });
  expect(res.status).toBe(413);
});
