import type { Ctx } from "@alpenchaos/simulation-core";
import type { SimEvent } from "@alpenchaos/shared";
import type { NetMessage, NetworkState } from "./types";

export const NET_MSG = "net:msg";

/**
 * Send one message. Always consumes exactly two RNG draws (jitter, loss) before
 * any branching, so draw order stays identical across runs no matter which
 * faults are active. Dead senders send nothing; messages across partitions or
 * lost to `lossRate` are dropped and traced.
 */
export function send(
  net: NetworkState,
  ctx: Ctx,
  from: number,
  to: number,
  kind: string,
  body: unknown,
): boolean {
  const jitter = ctx.rng.int(0, net.jitterMs + 1);
  const lossRoll = ctx.rng.next();
  if (!net.validators[from]!.up) return false;
  if (net.group[from] !== net.group[to]) {
    ctx.trace({ time: ctx.now, kind: "net:drop", reason: "partition", from, to, msgKind: kind });
    return false;
  }
  if (lossRoll < net.lossRate) {
    ctx.trace({ time: ctx.now, kind: "net:drop", reason: "loss", from, to, msgKind: kind });
    return false;
  }
  const delay =
    from === to
      ? 0
      : Math.max(1, net.baseLatency[from]![to]! + jitter + net.extraDelay[from]! + net.extraDelay[to]!);
  const msg: NetMessage = { from, to, kind, body };
  ctx.schedule(delay, net.validators[to]!.id, NET_MSG, msg);
  if (net.traceSends) {
    ctx.trace({ time: ctx.now, kind: "net:send", from, to, msgKind: kind, arrive: ctx.now + delay });
  }
  return true;
}

/** Send to every validator (optionally including the sender itself). */
export function broadcast(
  net: NetworkState,
  ctx: Ctx,
  from: number,
  kind: string,
  body: unknown,
  includeSelf = false,
): void {
  for (let to = 0; to < net.validators.length; to++) {
    if (to === from && !includeSelf) continue;
    send(net, ctx, from, to, kind, body);
  }
}

/**
 * Call when a "net:msg" event arrives. Returns the message, or null if the
 * receiver went down or got partitioned while it was in flight.
 */
export function receive(net: NetworkState, ev: SimEvent, ctx: Ctx): NetMessage | null {
  const m = ev.payload as NetMessage;
  if (!net.validators[m.to]!.up) {
    ctx.trace({ time: ctx.now, kind: "net:drop", reason: "receiver-down", from: m.from, to: m.to, msgKind: m.kind });
    return null;
  }
  if (net.group[m.from] !== net.group[m.to]) {
    ctx.trace({ time: ctx.now, kind: "net:drop", reason: "partition-in-flight", from: m.from, to: m.to, msgKind: m.kind });
    return null;
  }
  return m;
}
