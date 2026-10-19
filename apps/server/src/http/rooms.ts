import { Hono } from "hono";
import type { Hub } from "../realtime/hub";
import type { Store } from "../realtime/store";

const SCENARIO_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MATCH_ID = /^[A-Za-z0-9-]{1,64}$/;

/** Rooms, leaderboards and replays. Live play happens over the WebSocket at /ws. */
export function roomRoutes(deps: { hub: Hub; store: Store }): Hono {
  const { hub, store } = deps;
  const routes = new Hono();

  routes.post("/rooms", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "INVALID_JSON", message: "Request body must be valid JSON" }, 400);
    }
    const id = (body as { scenarioId?: unknown } | null)?.scenarioId;
    if (typeof id !== "string" || id.trim().length === 0) {
      return c.json({ error: "INVALID_REQUEST", message: "scenarioId must be a non-empty string" }, 400);
    }
    const r = hub.createRoom(id);
    if (r.ok) return c.json({ roomId: r.roomId, scenarioId: id, ws: "/ws/match" }, 201);
    const status = { SCENARIO_NOT_FOUND: 404, NOT_PLAY_MODE: 400, TOO_MANY_ROOMS: 503 }[r.error];
    return c.json({ error: r.error, message: r.error === "NOT_PLAY_MODE" ? "Only play-mode scenarios can be played live" : r.error }, status as 400 | 404 | 503);
  });

  routes.get("/rooms/:id", (c) => {
    const info = hub.describeRoom(c.req.param("id"));
    if (!info) return c.json({ error: "ROOM_NOT_FOUND", message: "No such room" }, 404);
    return c.json(info);
  });

  routes.get("/leaderboard/:scenarioId", (c) => {
    const scenarioId = c.req.param("scenarioId");
    const role = c.req.query("role") ?? "chaos";
    const limit = Number(c.req.query("limit") ?? 20);
    if (!SCENARIO_ID.test(scenarioId)) return c.json({ error: "INVALID_REQUEST", message: "invalid scenario id" }, 400);
    if (role !== "chaos" && role !== "defender") return c.json({ error: "INVALID_REQUEST", message: "role must be chaos or defender" }, 400);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) return c.json({ error: "INVALID_REQUEST", message: "limit must be an integer from 1 to 100" }, 400);
    return c.json({ scenarioId, role, rows: store.top(scenarioId, role, limit) });
  });

  routes.get("/replays", (c) => {
    const limit = Number(c.req.query("limit") ?? 50);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return c.json({ error: "INVALID_REQUEST", message: "limit must be an integer from 1 to 100" }, 400);
    }
    const replays = store.recent(limit);
    return c.json({ count: replays.length, replays });
  });

  /** Everything needed to re-simulate a finished match: scenario id + action log. */
  routes.get("/replays/:id", (c) => {
    const id = c.req.param("id");
    const m = MATCH_ID.test(id) ? store.getMatch(id) : undefined;
    if (!m) return c.json({ error: "REPLAY_NOT_FOUND", message: "No such match" }, 404);
    return c.json(m);
  });

  return routes;
}
