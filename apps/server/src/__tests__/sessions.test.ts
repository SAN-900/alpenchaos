
import { expect, test } from "vitest";
import { app } from "../app";

test("POST /sessions creates a baseline session", async () => {
  const response = await app.request("/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenarioId: "baseline" }),
  });

  const body = await response.json();

  expect(response.status).toBe(201);
  expect(body.sessionId).toEqual(expect.any(String));
  expect(body.scenarioId).toBe("baseline");
  expect(body.mode).toBe("watch");
  expect(body.simTimeMs).toBe(0);
  expect(body.status).toBe("created");
});

test("POST /sessions rejects unknown scenarios", async () => {
  const response = await app.request("/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenarioId: "unknown-scenario" }),
  });

  expect(response.status).toBe(404);
});

test("POST /sessions/:sessionId/advance advances the simulation", async () => {
  const created = await app.request("/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenarioId: "baseline" }),
  });

  const session = await created.json();

  const response = await app.request(
    `/sessions/${session.sessionId}/advance`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ durationMs: 1000 }),
    },
  );

  const body = await response.json();

  expect(response.status).toBe(200);
    expect(body.simTimeMs).toBe(1000);
    expect(body.events).toEqual(expect.any(Array));

    expect(body.eventCount).toBeGreaterThanOrEqual(
    body.events.length,
    );
    expect(body.events.length).toBeLessThanOrEqual(50);

    expect(body.traceSummary.totalEvents).toBe(body.eventCount);
    expect(body.traceSummary.returnedEvents).toBe(
    body.events.length,
    );
    expect(body.traceSummary.truncated).toBe(
    body.eventCount > body.events.length,
    );
});

test("GET /sessions/:sessionId returns network and consensus state", async () => {
  const created = await app.request("/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenarioId: "baseline" }),
  });

  const session = await created.json();

  const response = await app.request(
    `/sessions/${session.sessionId}`,
  );

  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body.sessionId).toBe(session.sessionId);
  expect(body.simTimeMs).toBe(0);
  expect(body.network.validators.length).toBeGreaterThan(0);
  expect(body.consensus.alpenglow.slots).toEqual([]);
  expect(body.consensus.towerBft.slots).toEqual([]);
});

test("session endpoints return 404 for unknown session IDs", async () => {
  const response = await app.request(
    "/sessions/missing-session",
  );

  expect(response.status).toBe(404);
});

test("advance rejects invalid durations", async () => {
  const created = await app.request("/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenarioId: "baseline" }),
  });

  const session = await created.json();

  const response = await app.request(
    `/sessions/${session.sessionId}/advance`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ durationMs: -1 }),
    },
  );

  expect(response.status).toBe(400);
});
