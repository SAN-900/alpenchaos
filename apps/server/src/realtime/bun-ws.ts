import type { WebSocketHandler } from "bun";
import type { Hub } from "./hub";

export type WsData = { id: string };

/**
 * Thin adapter between Bun's WebSocket server and the transport-agnostic Hub.
 * All behaviour lives in the Hub; this file only translates callbacks.
 * Clients should send {"t":"ping"} about every 30s to stay under idleTimeout.
 */
export function websocketHandlers(hub: Hub): WebSocketHandler<WsData> {
  return {
    maxPayloadLength: 8 * 1024,
    idleTimeout: 120,
    open(ws) {
      hub.connect({
        id: ws.data.id,
        send: (data) => void ws.send(data),
        close: (code, reason) => ws.close(code, reason),
      });
    },
    message(ws, message) {
      hub.message(ws.data.id, typeof message === "string" ? message : new TextDecoder().decode(message));
    },
    close(ws) {
      hub.disconnect(ws.data.id);
    },
  };
}
