
import { Hono } from "hono";
import {
  advanceSession,
  createSession,
} from "../rooms/room";
import { buildSessionState } from "../rooms/state";
import { getStoredSession } from "../rooms/registry";

export const sessionRoutes = new Hono();

sessionRoutes.post("/sessions", async (c) => {
  let body: unknown;

  try {
    body = await c.req.json();
  } catch {
    return c.json(
      {
        error: "INVALID_JSON",
        message: "Request body must be valid JSON",
      },
      400,
    );
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("scenarioId" in body) ||
    typeof body.scenarioId !== "string" ||
    body.scenarioId.trim().length === 0
  ) {
    return c.json(
      {
        error: "INVALID_REQUEST",
        message: "scenarioId must be a non-empty string",
      },
      400,
    );
  }

  const sessionId = crypto.randomUUID();
  const session = createSession(sessionId, body.scenarioId);

  if (!session) {
    return c.json(
      {
        error: "SCENARIO_NOT_FOUND",
        message: `Unknown scenario: ${body.scenarioId}`,
      },
      404,
    );
  }

  return c.json(session, 201);
});

sessionRoutes.post("/sessions/:sessionId/advance", async (c) => {
  const sessionId = c.req.param("sessionId");

  let body: unknown;

  try {
    body = await c.req.json();
  } catch {
    return c.json(
      {
        error: "INVALID_JSON",
        message: "Request body must be valid JSON",
      },
      400,
    );
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("durationMs" in body) ||
    typeof body.durationMs !== "number" ||
    !Number.isInteger(body.durationMs) ||
    body.durationMs < 1 ||
    body.durationMs > 60_000
  ) {
    return c.json(
      {
        error: "INVALID_REQUEST",
        message: "durationMs must be an integer between 1 and 60000",
      },
      400,
    );
  }

  const result = advanceSession(sessionId, body.durationMs);

  if ("error" in result) {
    const status = {
      SESSION_NOT_FOUND: 404,
      UNSUPPORTED_MODE: 400,
      EVENT_LIMIT_REACHED: 503,
    }[result.error];

    return c.json(result, status as 400 | 404 | 503);
  }

  return c.json(result);
});

sessionRoutes.get("/sessions/:sessionId", (c) => {
  const sessionId = c.req.param("sessionId");
  const stored = getStoredSession(sessionId);

  if (!stored) {
    return c.json(
      {
        error: "SESSION_NOT_FOUND",
        message: "Session does not exist",
      },
      404,
    );
  }

  return c.json(buildSessionState(sessionId, stored));
});
