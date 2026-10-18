
import { Hono } from "hono";
import {actOnSession, advanceSession, createSession, deleteSession} from "../rooms/room";
import { buildSessionState } from "../rooms/state";
import { getRoom } from "../rooms/registry";
import { parseActionBody, parseAdvanceBody } from "./validate";

export const sessionRoutes = new Hono();
const invalidJson = { error: "INVALID_JSON", message: "Request body must be valid JSON" } as const;
const notFound = { error: "SESSION_NOT_FOUND", message: "Session does not exist" } as const;

sessionRoutes.post("/sessions", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(invalidJson, 400);
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("scenarioId" in body) ||
    typeof body.scenarioId !== "string" ||
    body.scenarioId.trim().length === 0
  ) {
    return c.json({ error: "INVALID_REQUEST", message: "scenarioId must be a non-empty string" }, 400);
  }

  const session = createSession(crypto.randomUUID(), body.scenarioId);
  if (!session) {
    return c.json({ error: "SCENARIO_NOT_FOUND", message: `Unknown scenario: ${body.scenarioId}` }, 404);
  }
  return c.json(session, 201);
});

sessionRoutes.post("/sessions/:sessionId/advance", async (c) => {
  const sessionId = c.req.param("sessionId");

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(invalidJson, 400);
  }

  const parsed = parseAdvanceBody(body);
  if (!parsed.ok) return c.json({ error: "INVALID_REQUEST", message: parsed.message }, 400);

  const result = advanceSession(sessionId, parsed.value.durationMs, parsed.value.limit);
  if ("error" in result) {
    const status = { SESSION_NOT_FOUND: 404, UNSUPPORTED_MODE: 400, EVENT_LIMIT_REACHED: 503 }[result.error];
    return c.json(result, status as 400 | 404 | 503);
  }
  return c.json(result);
});

/** Play-mode only. Body: { role: "chaos" | "defender", action: { type, ... } } */
sessionRoutes.post("/sessions/:sessionId/actions", async (c) => {
  const sessionId = c.req.param("sessionId");

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(invalidJson, 400);
  }

  const parsed = parseActionBody(body);
  if (!parsed.ok) return c.json({ error: "INVALID_REQUEST", message: parsed.message }, 400);

  const out = actOnSession(sessionId, parsed.value.role, parsed.value.action);
  if (out.ok) return c.json(out);
  const status = { SESSION_NOT_FOUND: 404, NOT_PLAY_MODE: 409, ACTION_REJECTED: 422 }[out.error];
  return c.json({ error: out.error, message: out.message }, status as 404 | 409 | 422);
});

sessionRoutes.get("/sessions/:sessionId", (c) => {
  const sessionId = c.req.param("sessionId");
  const stored = getRoom(sessionId);
  if (!stored) return c.json(notFound, 404);
  return c.json(buildSessionState(sessionId, stored));
});

sessionRoutes.delete("/sessions/:sessionId", (c) => {
  const sessionId = c.req.param("sessionId");
  if (!deleteSession(sessionId)) return c.json(notFound, 404);
  return c.body(null, 204);
});
