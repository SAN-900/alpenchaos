import {
  crashStake,
  heal,
  kill,
  killLeader,
  lossBurst,
  mergeScripts,
  pickByStake,
  revive,
  silenceLeader,
  slowValidators,
  type FaultScript,
} from "@alpenchaos/fault-injection";
import { leaderForSlot, NET_PARTITION, type NetworkState } from "@alpenchaos/network-simulator";
import type { FaultSpec, Target } from "./types";

function cutOff(group: number[], at: number, healAt: number | undefined, label: string): FaultScript {
  return [
    { at, kind: NET_PARTITION, payload: { groups: [group] }, label },
    ...(healAt === undefined ? [] : heal(healAt)),
  ];
}

export function resolveTarget(net: NetworkState, t: Target): number[] {
  if (Array.isArray(t)) return t;
  if ("leaderOfSlot" in t) return [leaderForSlot(net, t.leaderOfSlot)];
  return pickByStake(net, t.pct, t.from ?? "bottom");
}

/**
 * Turn declarative fault specs into the engine's FaultScript. Pure: the same
 * (net, specs) always gives the same script. `slotMs` must match the protocol.
 */
export function resolveFaults(net: NetworkState, specs: readonly FaultSpec[], slotMs = 400): FaultScript {
  const parts: FaultScript[] = specs.map((f) => {
    switch (f.type) {
      case "killLeader":
        return killLeader(net, f.slot, { at: f.at, slotMs });
      case "silenceLeader":
        return silenceLeader(net, f.slot, { windows: f.windows, slotMs });
      case "kill":
        return kill(f.v, f.at);
      case "revive":
        return revive(f.v, f.at);
      case "crashStake": {
        const down = crashStake(net, f.pct, { at: f.at, from: f.from });
        if (f.reviveAt === undefined) return down;
        const vs = pickByStake(net, f.pct, f.from ?? "bottom");
        return [...down, ...vs.flatMap((v) => revive(v, f.reviveAt!))];
      }
      case "partition":
        return cutOff(pickByStake(net, f.pct, f.from ?? "bottom"), f.at, f.healAt, `partition ${f.pct}% stake`);
      case "isolate": {
        const vs = resolveTarget(net, f.targets);
        return cutOff(vs, f.at, f.healAt, `isolate ${vs.map((v) => `v${v}`).join(", ")}`);
      }
      case "heal":
        return heal(f.at);
      case "slow":
        return slowValidators(resolveTarget(net, f.targets), f.extraMs, { at: f.at, until: f.until });
      case "loss":
        return lossBurst(f.rate, { at: f.at, until: f.until });
    }
  });
  return mergeScripts(...parts);
}
