import { expect, test } from "vitest";
import { listScenarios } from "@alpenchaos/scenarios";
import { app } from "../app";

test("GET /scenarios returns registered scenarios", async () => {
  const response = await app.request("/scenarios");
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body.count).toBe(listScenarios().length);
  expect(body.count).toBeGreaterThan(0);

  expect(body.scenarios[0]).toEqual(
    expect.objectContaining({
      id: expect.any(String),
      name: expect.any(String),
      difficulty: expect.any(Number),
      tags: expect.any(Array),
    }),
  );
});

test("GET /scenarios returns scenario-picker metadata", async () => {
  const response = await app.request("/scenarios");
  const body = await response.json();

  expect(body.scenarios[0]).toHaveProperty("description");
  expect(body.scenarios[0]).toHaveProperty("durationMs");
});