import type { Ctx } from "@alpenchaos/simulation-core";
import type { SimEvent } from "@alpenchaos/shared";
import type { NetworkState } from "./types";

export const NET_KILL = "net:kill";           // { v: number }
export const NET_REVIVE = "net:revive";       // { v: number }
export const NET_PARTITION = "net:partition"; // { groups: number[][] } listed groups get ids 1..k, the rest stay in 0
export const NET_HEAL = "net:heal";           // {}
export const NET_DELAY = "net:delay";         // { v: number, extraMs: number }
export const NET_LOSS = "net:loss";           // { rate: number }

function checkIndex(net: NetworkState, v: unknown): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v >= net.validators.length) {
    throw new RangeError(`network fault: invalid validator index ${String(v)}`);
  }
  return v;
}

/**
 * Apply a network fault event to `net`. Returns true if the event was a
 * network fault (handled), false if the caller should route it elsewhere.
 * Faults are ordinary events, so players, scripts and scenarios all use the
 * same path: engine.schedule(delay, "world", NET_KILL, { v: 3 }).
 */
export function applyNetEvent(net: NetworkState, ev: SimEvent, ctx: Ctx): boolean {
  const p = (ev.payload ?? {}) as Record<string, unknown>;
  switch (ev.kind) {
    case NET_KILL: {
      const v = checkIndex(net, p.v);
      net.validators[v]!.up = false;
      ctx.trace({ time: ctx.now, kind: "fault:kill", v });
      return true;
    }
    case NET_REVIVE: {
      const v = checkIndex(net, p.v);
      net.validators[v]!.up = true;
      ctx.trace({ time: ctx.now, kind: "fault:revive", v });
      return true;
    }
    case NET_PARTITION: {
      const groups = p.groups as number[][];
      net.group.fill(0);
      groups.forEach((g, k) => g.forEach((v) => (net.group[checkIndex(net, v)] = k + 1)));
      ctx.trace({ time: ctx.now, kind: "fault:partition", groups });
      return true;
    }
    case NET_HEAL: {
      net.group.fill(0);
      ctx.trace({ time: ctx.now, kind: "fault:heal" });
      return true;
    }
    case NET_DELAY: {
      const v = checkIndex(net, p.v);
      const extraMs = p.extraMs as number;
      if (!Number.isInteger(extraMs) || extraMs < 0) throw new RangeError("network fault: extraMs must be an integer >= 0");
      net.extraDelay[v] = extraMs;
      ctx.trace({ time: ctx.now, kind: "fault:delay", v, extraMs });
      return true;
    }
    case NET_LOSS: {
      const rate = p.rate as number;
      if (typeof rate !== "number" || rate < 0 || rate > 1) throw new RangeError("network fault: rate must be in [0, 1]");
      net.lossRate = rate;
      ctx.trace({ time: ctx.now, kind: "fault:loss", rate });
      return true;
    }
    default:
      return false;
  }
}
