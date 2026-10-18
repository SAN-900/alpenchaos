
import type { ServerWebSocket } from "bun";
import { advanceSession } from "../rooms/room";
import { getRoom } from "../rooms/registry";
import { buildSessionState } from "../rooms/state";
import { validateClientMessage } from "./messages";

type SocketData = {
  clientId: string;
};

type ClientSocket = ServerWebSocket<SocketData>;

const subscriptions = new Map<string, Set<ClientSocket>>();

function sendJson(ws: ClientSocket, payload: unknown): void {
  ws.send(JSON.stringify(payload));
}

function broadcast(
  roomId: string,
  payload: unknown,
  exclude?: ClientSocket,
): void {
  const clients = subscriptions.get(roomId);
  if (!clients) return;

  const message = JSON.stringify(payload);

  for (const client of clients) {
    if (client === exclude) continue;

    try {
      client.send(message);
    } catch {
      clients.delete(client);
    }
  }

  if (clients.size === 0) {
    subscriptions.delete(roomId);
  }
}

function unsubscribe(ws: ClientSocket): void {
  for (const [roomId, clients] of subscriptions) {
    clients.delete(ws);

    if (clients.size === 0) {
      subscriptions.delete(roomId);
    }
  }
}

export const websocket = {
  open(_ws: ClientSocket) {
    // Connection established.
  },

  message(ws: ClientSocket, raw: string | Buffer) {
    let input: unknown;

    try {
      input = JSON.parse(
        typeof raw === "string" ? raw : raw.toString(),
      );
    } catch {
      sendJson(ws, {
        type: "error",
        error: "INVALID_JSON",
        message: "Message must contain valid JSON",
      });
      return;
    }

    const validation = validateClientMessage(input);

    if (!validation.success) {
      sendJson(ws, {
        type: "error",
        error: "INVALID_MESSAGE",
        message: validation.error,
      });
      return;
    }

    const message = validation.data;
    const room = getRoom(message.roomId);

    if (!room) {
      sendJson(ws, {
        type: "error",
        error: "ROOM_NOT_FOUND",
        message: "Room does not exist",
      });
      return;
    }

    switch (message.type) {
      case "room:subscribe": {
        let clients = subscriptions.get(message.roomId);

        if (!clients) {
          clients = new Set<ClientSocket>();
          subscriptions.set(message.roomId, clients);
        }

        clients.add(ws);

        sendJson(ws, {
          type: "room:subscribed",
          roomId: message.roomId,
          state: buildSessionState(message.roomId, room),
        });

        break;
      }

      case "state:request": {
        sendJson(ws, {
          type: "state:snapshot",
          state: buildSessionState(message.roomId, room),
        });

        break;
      }

      case "simulation:advance": {
        const result = advanceSession(
            message.roomId,
            message.durationMs,
        );

        if ("error" in result) {
            sendJson(ws, {
            type: "error",
            error: result.error,
            message: result.message,
            });
            return;
        }

        const update = {
            type: "simulation:advanced",
            result,
            state: buildSessionState(message.roomId, room),
        };

        // Always acknowledge the client that requested the advance.
        sendJson(ws, update);

        // Notify other clients subscribed to this room.
        broadcast(message.roomId, update, ws);

        break;
        }
    }
  },

  close(ws: ClientSocket) {
    unsubscribe(ws);
  },
};
