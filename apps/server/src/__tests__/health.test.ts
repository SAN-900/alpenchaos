import { expect, test } from "vitest";
import { app } from "../app";

test("GET /health returns the server health status", async () => {
  const response = await app.request("/health");
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body.status).toBe("ok");
  expect(body.service).toBe("alpenchaos-server");
  expect(body.timestamp).toEqual(expect.any(String));
});

test("unknown routes return 404", async () => {
  const response = await app.request("/not-a-route");

  expect(response.status).toBe(404);
});