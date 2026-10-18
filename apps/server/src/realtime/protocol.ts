import type { Role } from "@alpenchaos/game-rules";

export const MAX_MESSAGE_BYTES = 4096;

export type ClientMsg =
  | { t: "join"; room: string; role?: Role | "spectator"; token?: string; name?: string }
  | { t: "start" }
  | { t: "action"; action: unknown }
  | { t: "ping" };

export type ParsedMsg = { ok: true; msg: ClientMsg } | { ok: false; code: string; message: string };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const ID = /^[A-Za-z0-9-]{1,64}$/;
const bad = (code: string, message: string): ParsedMsg => ({ ok: false, code, message });

/** Display names: letters, digits, space, dash, underscore, dot; at most 24 characters. */
export function sanitizeName(x: unknown): string {
  if (typeof x !== "string") return "player";
  const s = x.replace(/[^\p{L}\p{N} _.-]/gu, "").trim().slice(0, 24);
  return s.length > 0 ? s : "player";
}

/** Parse one raw client frame. Never throws. */
export function parseClientMessage(raw: string): ParsedMsg {
  if (raw.length > MAX_MESSAGE_BYTES) return bad("TOO_LARGE", "message too large");
  let x: unknown;
  try {
    x = JSON.parse(raw);
  } catch {
    return bad("BAD_JSON", "message must be valid JSON");
  }
  if (!isObj(x) || typeof x.t !== "string") return bad("BAD_MESSAGE", "message needs a string field t");

  switch (x.t) {
    case "join": {
      if (typeof x.room !== "string" || !ID.test(x.room)) return bad("BAD_MESSAGE", "join needs a valid room id");
      if (x.role !== undefined && x.role !== "chaos" && x.role !== "defender" && x.role !== "spectator") {
        return bad("BAD_MESSAGE", "role must be chaos, defender or spectator");
      }
      if (x.token !== undefined && !(typeof x.token === "string" && ID.test(x.token))) return bad("BAD_MESSAGE", "invalid token");
      return {
        ok: true,
        msg: {
          t: "join",
          room: x.room,
          ...(x.role === undefined ? {} : { role: x.role as Role | "spectator" }),
          ...(x.token === undefined ? {} : { token: x.token as string }),
          name: sanitizeName(x.name),
        },
      };
    }
    case "start":
      return { ok: true, msg: { t: "start" } };
    case "ping":
      return { ok: true, msg: { t: "ping" } };
    case "action":
      if (!isObj(x.action)) return bad("BAD_MESSAGE", "action must be an object");
      return { ok: true, msg: { t: "action", action: x.action } };
    default:
      return bad("BAD_MESSAGE", `unknown message type "${x.t}"`);
  }
}
