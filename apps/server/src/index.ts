
import { serve } from "bun";
import { app } from "./app";
import { websocket } from "./ws/handler";

const port = Number(Bun.env.PORT ?? 3001);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`Invalid PORT: ${Bun.env.PORT}`);
}

serve({
  port,

  fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req, {
        data: {
          clientId: crypto.randomUUID(),
        },
      });

      if (upgraded) {
        return undefined;
      }

      return new Response("WebSocket upgrade failed", {
        status: 400,
      });
    }

    return app.fetch(req);
  },

  websocket,
});

console.log(`AlpenChaos server listening on http://localhost:${port}`);
console.log(`WebSocket endpoint: ws://localhost:${port}/ws`);
