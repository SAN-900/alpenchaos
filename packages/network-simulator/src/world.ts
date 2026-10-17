import type { Ctx, Dispatch } from "@alpenchaos/simulation-core";
import type { Protocol, ProtocolEnv } from "@alpenchaos/shared";
import { NET_MSG, broadcast, receive, send } from "./delivery";
import { applyNetEvent } from "./faults";
import { leaderForSlot } from "./leader";
import { meetsThreshold, stakeOf } from "./stake";
import type { NetworkState } from "./types";

export const WORLD_START = "world:start";
export const TIMER = "timer";

/** Plain-data world: the network plus one state object per protocol, by name. */
export type WorldState = { net: NetworkState; protocols: Record<string, unknown> };

export function createWorld(net: NetworkState, protocols: Protocol<any>[]): WorldState {
  const states: Record<string, unknown> = {};
  for (const p of protocols) {
    if (p.name in states) throw new Error(`duplicate protocol name: ${p.name}`);
    states[p.name] = p.init(net.validators.length);
  }
  return { net, protocols: states };
}

type TimerPayload = { proto: string; v: number; kind: string; body: unknown };

function makeEnv(net: NetworkState, ctx: Ctx, name: string): ProtocolEnv {
  return {
    get now() {
      return ctx.now;
    },
    validators: net.validators.length,
    isUp: (v) => net.validators[v]!.up,
    leaderForSlot: (slot) => leaderForSlot(net, slot),
    stakeThreshold: (voters, num, den) => meetsThreshold(stakeOf(net, voters), net.totalStake, num, den),
    send: (from, to, kind, body = null) => void send(net, ctx, from, to, `${name}:${kind}`, body),
    broadcast: (from, kind, body = null, includeSelf = false) =>
      broadcast(net, ctx, from, `${name}:${kind}`, body, includeSelf),
    setTimer: (v, delayMs, kind, body = null) => {
      const payload: TimerPayload = { proto: name, v, kind, body };
      ctx.schedule(delayMs, net.validators[v]!.id, TIMER, payload);
    },
    emit: (entry) => ctx.trace({ ...entry, kind: `${name}:${entry.kind}`, time: ctx.now, proto: name }),
  };
}

/**
 * One dispatcher for the whole simulation. Routes network faults, message
 * arrivals (checked at arrival time) and timers to the right protocol. Several
 * protocols can run side by side on the same network and faults, e.g. to
 * compare finality. Unknown event kinds are ignored so other layers (game
 * rules, scenarios) can handle their own events before delegating here.
 *
 * Usage:
 *   const engine = new Engine(createWorld(net, [ag]), createWorldDispatch([ag]), seed);
 *   engine.schedule(0, "world", WORLD_START);
 */
export function createWorldDispatch(protocols: Protocol<any>[]): Dispatch<WorldState> {
  const byName = new Map(protocols.map((p) => [p.name, p] as const));
  return (w, ev, ctx) => {
    if (applyNetEvent(w.net, ev, ctx)) return;

    if (ev.kind === WORLD_START) {
      for (const p of protocols) p.start(w.protocols[p.name], makeEnv(w.net, ctx, p.name));
      return;
    }

    if (ev.kind === NET_MSG) {
      const m = receive(w.net, ev, ctx);
      if (!m) return;
      const i = m.kind.indexOf(":");
      const name = m.kind.slice(0, i);
      const p = byName.get(name);
      if (!p) return;
      p.onMessage(w.protocols[name], m.to, { from: m.from, to: m.to, kind: m.kind.slice(i + 1), body: m.body }, makeEnv(w.net, ctx, name));
      return;
    }

    if (ev.kind === TIMER) {
      const t = ev.payload as TimerPayload;
      const p = byName.get(t.proto);
      if (!p) return;
      p.onTimer(w.protocols[t.proto], t.v, t.kind, t.body, makeEnv(w.net, ctx, t.proto));
    }
  };
}
