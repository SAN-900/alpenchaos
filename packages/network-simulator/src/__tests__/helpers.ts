import { Engine, Rng, type Dispatch } from "@alpenchaos/simulation-core";
import {
  applyNetEvent,
  broadcast,
  createNetwork,
  receive,
  NET_MSG,
  type NetworkConfig,
  type NetworkState,
} from "../index";

export type Got = { from: number; to: number; kind: string; time: number };
export type S = { net: NetworkState; got: Got[] };

const dispatch: Dispatch<S> = (s, ev, ctx) => {
  if (applyNetEvent(s.net, ev, ctx)) return;
  if (ev.kind === NET_MSG) {
    const m = receive(s.net, ev, ctx);
    if (m) s.got.push({ from: m.from, to: m.to, kind: m.kind, time: ctx.now });
    return;
  }
  if (ev.kind === "go") broadcast(s.net, ctx, (ev.payload as { from: number }).from, "hi", null);
};

export function setup(cfg: Partial<NetworkConfig> = {}, seed = 1) {
  const net = createNetwork({ validators: 8, ...cfg }, new Rng(seed));
  return new Engine<S>({ net, got: [] }, dispatch, seed);
}

export const receivers = (e: Engine<S>) => e.state.got.map((g) => g.to).sort((a, b) => a - b);
