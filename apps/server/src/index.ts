import { Database } from "bun:sqlite";
import { createApp } from "./app";
import { getAllowedOrigins, isOriginAllowed } from "./config";
import { Hub } from "./realtime/hub";
import { websocketHandlers, type WsData } from "./realtime/bun-ws";
import { SqliteStore } from "./realtime/store";
import { sweep } from "./rooms/registry";
import { websocket as sessionWebsocket } from "./ws/handler";

const port = Number(Bun.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`Invalid PORT: ${Bun.env.PORT}`);
}

const store = new SqliteStore(new Database(Bun.env.DB_PATH ?? "alpenchaos.sqlite", { create: true }));
const hub = new Hub({ store, now: Date.now, randomId: () => crypto.randomUUID() });
const app = createApp({ hub, store });
const origins = getAllowedOrigins();


type SocketData =
  | { kind: "session"; clientId: string }
  | { kind: "match"; id: string };

const matchWebsocket = websocketHandlers(hub);

Bun.serve<SocketData>({
  port,

  fetch(req, server) {
    const path = new URL(req.url).pathname;

    if (path === "/ws" || path === "/ws/match") {
      if (!isOriginAllowed(req.headers.get("origin"), origins)) {
        return new Response("forbidden origin", { status: 403 });
      }

      const data: SocketData =
        path === "/ws"
          ? { kind: "session", clientId: crypto.randomUUID() }
          : { kind: "match", id: crypto.randomUUID() };

      if (server.upgrade(req, { data })) return undefined;

      return new Response("expected a WebSocket upgrade", {
        status: 426,
      });
    }

    return app.fetch(req);
  },

  websocket: {
    maxPayloadLength: 8 * 1024,
    idleTimeout: 120,

    open(ws) {
      if (ws.data.kind === "session") {
        sessionWebsocket.open(ws as never);
      } else {
        matchWebsocket.open?.(ws as never);
      }
    },

    message(ws, message) {
      if (ws.data.kind === "session") {
        sessionWebsocket.message(ws as never, message as string | Buffer);
      } else {
        matchWebsocket.message(
          ws as never,
          message as Parameters<typeof matchWebsocket.message>[1],
        );
      }
    },

    close(ws, code, reason) {
      if (ws.data.kind === "session") {
        sessionWebsocket.close(ws as never);
      } else {
        matchWebsocket.close?.(ws as never, code, reason);
      }
    },
  },
});


setInterval(() => hub.tick(Date.now()), 100); // one wall-clock tick drives every live match
setInterval(() => sweep(), 60_000);           // drop idle HTTP sessions

console.log(`AlpenChaos server listening on http://localhost:${port}`);
console.log(`Simulation WebSocket: ws://localhost:${port}/ws`);
console.log(`Multiplayer WebSocket: ws://localhost:${port}/ws/match`);
