import {
  heal, kill, killLeader, lossBurst, partitionStake, revive, slowValidators,
  type FaultScript, type TxSpec,
} from "@alpenchaos/fault-injection";
import type { NetworkState } from "@alpenchaos/network-simulator";
import { CHAOS_ACTIONS, DEFENDER_ACTIONS, type Action, type GameState, type Role } from "./types";

export type Plan =
  | { ok: true; cost: number; script: FaultScript; feed: string; tx?: TxSpec }
  | { ok: false; reason: string };

const no = (reason: string): Plan => ({ ok: false, reason });
const validIndex = (net: NetworkState, v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v < net.validators.length;
const partitionActive = (net: NetworkState) => net.group.some((g) => g !== 0);

/** Validate an action and turn it into fault events at `now`. Does not mutate anything. */
export function planAction(net: NetworkState, g: GameState, role: Role, a: Action, now: number): Plan {
  const { cfg } = g;
  const allowed = role === "chaos" ? CHAOS_ACTIONS : DEFENDER_ACTIONS;
  if (!allowed.includes(a.type)) return no(`${role} cannot use ${a.type}`);

  switch (a.type) {
    case "killLeader": {
      const slot = Math.floor(now / cfg.slotMs);
      const script = killLeader(net, slot, { at: now, slotMs: cfg.slotMs });
      const v = (script[0]!.payload as { v: number }).v;
      if (!net.validators[v]!.up) return no(`leader v${v} is already down`);
      return { ok: true, cost: cfg.costs.killLeader, script, feed: `chaos crashed leader v${v}` };
    }
    case "killValidator": {
      if (!validIndex(net, a.v)) return no("invalid validator");
      if (!net.validators[a.v]!.up) return no(`v${a.v} is already down`);
      return { ok: true, cost: cfg.costs.killValidator, script: kill(a.v, now), feed: `chaos crashed v${a.v}` };
    }
    case "partition": {
      if (!Number.isInteger(a.pct) || a.pct < 10 || a.pct > 40) return no("partition pct must be an integer in [10, 40]");
      if (partitionActive(net)) return no("a partition is already active");
      const cost = cfg.costs.partitionBase + Math.ceil(a.pct / 10) * cfg.costs.partitionPer10;
      const script = partitionStake(net, a.pct, { at: now, healAt: now + cfg.partitionMs });
      return { ok: true, cost, script, feed: `chaos partitioned ~${a.pct}% of stake` };
    }
    case "slowValidator": {
      if (!validIndex(net, a.v)) return no("invalid validator");
      const script = slowValidators([a.v], cfg.slowExtraMs, { at: now, until: now + cfg.slowMs });
      return { ok: true, cost: cfg.costs.slowValidator, script, feed: `chaos slowed v${a.v} by ${cfg.slowExtraMs}ms` };
    }
    case "lossBurst": {
      const script = lossBurst(cfg.lossRate, { at: now, until: now + cfg.lossMs });
      return { ok: true, cost: cfg.costs.lossBurst, script, feed: `chaos started ${Math.round(cfg.lossRate * 100)}% packet loss` };
    }
    case "revive": {
      if (!validIndex(net, a.v)) return no("invalid validator");
      if (net.validators[a.v]!.up) return no(`v${a.v} is already up`);
      return { ok: true, cost: cfg.costs.revive, script: revive(a.v, now), feed: `defender revived v${a.v}` };
    }
    case "reviveAll": {
      const downs = net.validators.map((x, i) => (x.up ? -1 : i)).filter((i) => i >= 0);
      if (downs.length === 0) return no("nobody is down");
      return { ok: true, cost: cfg.costs.reviveAll, script: downs.flatMap((v) => revive(v, now)), feed: `defender revived ${downs.length} validators` };
    }
    case "healPartition": {
      if (!partitionActive(net)) return no("no partition is active");
      return { ok: true, cost: cfg.costs.healPartition, script: heal(now), feed: "defender healed the partition" };
    }
    case "sendTx": {
      const pending = g.txs.filter((t) => !t.scored).length;
      if (pending >= cfg.maxPendingTx) return no("too many transactions in flight");
      const id = a.id ?? `tx${g.txs.length + 1}`;
      return { ok: true, cost: cfg.costs.sendTx, script: [], feed: `defender sent ${id}`, tx: { id, sentAt: now } };
    }
  }
}
