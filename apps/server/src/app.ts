import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { getAllowedOrigins } from "./config";
import { healthRoutes } from "./http/health";
import { roomRoutes } from "./http/rooms";
import { scenarioRoutes } from "./http/scenarios";
import { sessionRoutes } from "./http/sessions";
import { Hub } from "./realtime/hub";
import { MemoryStore, type Store } from "./realtime/store";
import { liveRoutes } from "./http/live";
import { LiveObserver } from "./live/observer";

export type AppDeps = { hub: Hub; store: Store, liveObserver?: LiveObserver, enableLegacySessions?: boolean};

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  // The web app runs on another origin. Set ALLOWED_ORIGINS="https://a.com,https://b.com" in production.
  app.use("*", cors({ origin: getAllowedOrigins(), allowMethods: ["GET", "POST", "DELETE", "OPTIONS"], maxAge: 600 }));
  app.use(
    "*",
    bodyLimit({
      maxSize: 64 * 1024,
      onError: (c) => c.json({ error: "PAYLOAD_TOO_LARGE", message: "Request body is too large" }, 413),
    }),
  );

  app.route("/", healthRoutes);
  app.route("/", scenarioRoutes);
  if (deps.enableLegacySessions ?? true) {
    app.route("/", sessionRoutes);
  }
  app.route("/", roomRoutes(deps));

  if (deps.liveObserver) {
    app.route("/", liveRoutes(deps.liveObserver));
  }

  app.notFound((c) => c.json({ error: "NOT_FOUND", message: "Route not found" }, 404));
  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: "INTERNAL", message: "Unexpected server error" }, 500);
  });
  return app;
}

/** Default app with an in-memory store. Production wiring (SQLite, WebSockets) lives in index.ts. */
const store = new MemoryStore();
export const hub = new Hub({ store, now: Date.now, randomId: () => crypto.randomUUID() });
export const app = createApp({ hub, store });
