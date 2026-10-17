import { baseline } from "./presets/baseline";
import { fastPathDenied } from "./presets/fast-path-denied";
import { ghostBank } from "./presets/ghost-bank";
import { laggyLeader } from "./presets/laggy-leader";
import { lateTx } from "./presets/late-tx";
import { leaderKill } from "./presets/leader-kill";
import { partition20 } from "./presets/partition-20";
import { partition40 } from "./presets/partition-40";
import { rollingBlackout } from "./presets/rolling-blackout";
import { twentyTwenty } from "./presets/twenty-twenty";
import type { Scenario } from "./types";

/** Ordered easiest-first, which is the order the picker shows them. */
export const SCENARIOS: readonly Scenario[] = [
  baseline,
  leaderKill,
  ghostBank,
  laggyLeader,
  lateTx,
  fastPathDenied,
  partition20,
  twentyTwenty,
  rollingBlackout,
  partition40,
];

const byId = new Map(SCENARIOS.map((s) => [s.id, s] as const));

export const getScenario = (id: string): Scenario | undefined => byId.get(id);
export const listScenarios = (): readonly Scenario[] => SCENARIOS;
