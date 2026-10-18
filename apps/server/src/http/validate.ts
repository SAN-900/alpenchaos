import { CHAOS_ACTIONS, DEFENDER_ACTIONS, type Action, type Role } from "@alpenchaos/game-rules";
import { MAX_SAMPLE_LIMIT } from "../services/trace-summary";

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isInt = (x: unknown, lo: number, hi: number): x is number => Number.isInteger(x) && (x as number) >= lo && (x as number) <= hi;
const ALL = new Set<string>([...CHAOS_ACTIONS, ...DEFENDER_ACTIONS]);

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };
const bad = (message: string): { ok: false; message: string } => ({ ok: false, message });

export function parseAdvanceBody(body: unknown): Parsed<{ durationMs: number; limit?: number }> {
  if (!isObj(body) || !isInt(body.durationMs, 1, 60_000)) return bad("durationMs must be an integer between 1 and 60000");
  if (body.limit !== undefined && !isInt(body.limit, 1, MAX_SAMPLE_LIMIT)) return bad(`limit must be an integer between 1 and ${MAX_SAMPLE_LIMIT}`);
  return { ok: true, value: { durationMs: body.durationMs, ...(body.limit === undefined ? {} : { limit: body.limit }) } };
}

/**
 * Validate and normalize an action request. Only known fields survive, so
 * junk never reaches the match's action log. Range rules (does validator 7
 * exist? is it up?) are enforced by the game itself.
 */
export function parseActionBody(body: unknown): Parsed<{ role: Role; action: Action }> {
  if (!isObj(body)) return bad("body must be an object");
  if (body.role !== "chaos" && body.role !== "defender") return bad('role must be "chaos" or "defender"');
  const a = body.action;
  if (!isObj(a) || typeof a.type !== "string" || !ALL.has(a.type)) return bad("action.type is not a known action");
  const role = body.role as Role;

  switch (a.type) {
    case "killLeader":
    case "lossBurst":
    case "reviveAll":
    case "healPartition":
      return { ok: true, value: { role, action: { type: a.type } } };
    case "killValidator":
    case "slowValidator":
    case "revive":
      if (!isInt(a.v, 0, 10_000)) return bad("action.v must be a non-negative integer");
      return { ok: true, value: { role, action: { type: a.type, v: a.v } } };
    case "partition":
      if (!isInt(a.pct, 1, 100)) return bad("action.pct must be an integer");
      return { ok: true, value: { role, action: { type: "partition", pct: a.pct } } };
    case "sendTx":
      if (a.id !== undefined && !(typeof a.id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(a.id))) {
        return bad("action.id must be 1-40 letters, digits, dashes or underscores");
      }
      return { ok: true, value: { role, action: a.id === undefined ? { type: "sendTx" } : { type: "sendTx", id: a.id as string } } };
    default:
      return bad("action.type is not a known action");
  }
}
