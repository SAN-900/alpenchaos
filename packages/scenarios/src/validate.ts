import type { Scenario } from "./types";

const FAULT_TYPES = ["killLeader", "silenceLeader", "kill", "revive", "crashStake", "partition", "isolate", "heal", "slow", "loss"];
const OBJECTIVES = ["stall", "chaosScore", "txLost"];

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isInt = (x: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): x is number =>
  typeof x === "number" && Number.isInteger(x) && x >= min && x <= max;

type Ranges = Record<string, [number, number]>;

/** Numeric option objects: unknown keys are rejected, every value must be a finite number in range. */
function checkNumbers(x: unknown, where: string, ranges: Ranges, err: (m: string) => void): void {
  if (!isObj(x)) return err(`${where} must be an object`);
  for (const [k, v] of Object.entries(x)) {
    const r = ranges[k];
    if (!r) err(`${where}.${k} is not a known option`);
    else if (typeof v !== "number" || !Number.isFinite(v) || v < r[0] || v > r[1]) err(`${where}.${k} must be a number in [${r[0]}, ${r[1]}]`);
  }
}

const SLOT: [number, number] = [100, 2000];
const AG: Ranges = { slotMs: SLOT, timeoutMs: [100, 10_000], fastPct: [1, 100], slowPct: [1, 100] };
const TB: Ranges = { slotMs: SLOT, superNum: [1, 100], superDen: [1, 100], maxLockoutHistory: [1, 64] };
const TXCFG: Ranges = { slotMs: SLOT, maxAgeSlots: [1, 1000], forwardSlots: [0, 64] };
const GAME: Ranges = {
  durationMs: [1000, 600_000], stepMs: [50, 1000], slotMs: SLOT, energyMaxMilli: [1000, 100_000], energyStartMilli: [0, 100_000],
  regenMilliPerMs: [0, 10], stallWindowMs: [0, 60_000], breakStallMs: [1000, 1_000_000_000], partitionMs: [0, 600_000],
  slowMs: [0, 600_000], slowExtraMs: [0, 10_000], lossMs: [0, 600_000], lossRate: [0, 1], maxPendingTx: [0, 20],
};
const PTS: Ranges = { skip: [0, 1000], finalized: [0, 1000], stallStep: [0, 1000], txLanded: [0, 1000], txLost: [0, 1000] };
const COSTS: Ranges = {
  killLeader: [0, 100], killValidator: [0, 100], slowValidator: [0, 100], lossBurst: [0, 100], revive: [0, 100],
  reviveAll: [0, 100], healPartition: [0, 100], sendTx: [0, 100], partitionBase: [0, 100], partitionPer10: [0, 100],
};
const NETWORK: Ranges = { validators: [4, 64], regions: [1, 16], jitterMs: [0, 1000], zipfS: [0, 3], totalStake: [1000, 1_000_000_000], leaderWindows: [1, 4096], slotsPerWindow: [1, 16], lossRate: [0, 1] };

/**
 * Bounds on everything that reaches the simulation but is not covered above:
 * option objects (network, protocol, game, txConfig), tx details and list/string
 * sizes. These stop a shared scenario from asking for a 1 ms step, a negative
 * slot length or a million faults.
 */
function validateBounds(x: Record<string, unknown>, err: (m: string) => void): void {
  if (typeof x.id === "string" && x.id.length > 64) err("id must be at most 64 characters");
  for (const k of ["name", "tagline", "lesson"]) if (typeof x[k] === "string" && (x[k] as string).length > 300) err(`${k} must be at most 300 characters`);
  if (typeof x.description === "string" && x.description.length > 3000) err("description must be at most 3000 characters");

  const cap = (k: string, max: number) => { if (Array.isArray(x[k]) && (x[k] as unknown[]).length > max) err(`${k} must have at most ${max} entries`); };
  cap("faults", 100); cap("txs", 100); cap("annotations", 200); cap("tags", 20);

  if (isObj(x.network)) {
    const { traceSends, ...rest } = x.network as Record<string, unknown>;
    if (traceSends !== undefined && typeof traceSends !== "boolean") err("network.traceSends must be a boolean");
    checkNumbers(rest, "network", NETWORK, err);
  }
  if (x.protocol !== undefined) {
    if (!isObj(x.protocol)) err("protocol must be an object");
    else {
      for (const k of Object.keys(x.protocol)) if (k !== "ag" && k !== "tb") err(`protocol.${k} is not a known protocol`);
      if (x.protocol.ag !== undefined) checkNumbers(x.protocol.ag, "protocol.ag", AG, err);
      if (x.protocol.tb !== undefined) checkNumbers(x.protocol.tb, "protocol.tb", TB, err);
    }
  }
  if (x.txConfig !== undefined) checkNumbers(x.txConfig, "txConfig", TXCFG, err);
  if (x.game !== undefined) {
    if (!isObj(x.game)) err("game must be an object");
    else {
      const { pts, costs, tx, ...rest } = x.game as Record<string, unknown>;
      checkNumbers(rest, "game", GAME, err);
      if (pts !== undefined) checkNumbers(pts, "game.pts", PTS, err);
      if (costs !== undefined) checkNumbers(costs, "game.costs", COSTS, err);
      if (tx !== undefined) checkNumbers(tx, "game.tx", TXCFG, err);
    }
  }
  if (Array.isArray(x.txs)) {
    x.txs.forEach((t, i) => {
      if (!isObj(t)) return;
      if (typeof t.id === "string" && t.id.length > 64) err(`txs[${i}].id must be at most 64 characters`);
      if (t.uplinkMs !== undefined && !isInt(t.uplinkMs, 0, 10_000)) err(`txs[${i}].uplinkMs must be an integer in [0, 10000]`);
      if (t.recentSlot !== undefined && !isInt(t.recentSlot, 0)) err(`txs[${i}].recentSlot must be a non-negative integer`);
    });
  }
}

/**
 * Check untrusted scenario JSON (from disk, a request body, a replay link).
 * Returns every problem found, so an empty array means "safe to run".
 * Hand-written on purpose: no schema library needed in the client bundle.
 */
export function validateScenario(x: unknown): string[] {
  const errs: string[] = [];
  const err = (m: string) => void errs.push(m);
  if (!isObj(x)) return ["scenario must be an object"];

  for (const k of ["id", "name", "tagline", "description", "lesson"]) {
    if (typeof x[k] !== "string" || (x[k] as string).length === 0) err(`${k} must be a non-empty string`);
  }
  if (typeof x.id === "string" && !/^[a-z0-9][a-z0-9-]*$/.test(x.id)) err("id must be lowercase letters, digits and dashes");
  if (![1, 2, 3].includes(x.difficulty as number)) err("difficulty must be 1, 2 or 3");
  if (!Array.isArray(x.tags) || x.tags.some((t) => typeof t !== "string")) err("tags must be a string array");
  if (!isInt(x.seed, 0, 0x7fffffff)) err("seed must be an integer in [0, 2^31)");
  if (x.mode !== "watch" && x.mode !== "play") err('mode must be "watch" or "play"');
  if (!isInt(x.durationMs, 1000, 600_000)) err("durationMs must be an integer in [1000, 600000]");

  let n = 24;
  if (!isObj(x.network)) err("network must be an object");
  else {
    const net = x.network;
    if (net.validators !== undefined) {
      if (!isInt(net.validators, 4, 64)) err("network.validators must be an integer in [4, 64]");
      else n = net.validators;
    }
    if (net.lossRate !== undefined && !(typeof net.lossRate === "number" && net.lossRate >= 0 && net.lossRate <= 1)) err("network.lossRate must be in [0, 1]");
    if (net.jitterMs !== undefined && !isInt(net.jitterMs, 0, 1000)) err("network.jitterMs must be an integer in [0, 1000]");
  }

  const checkTarget = (t: unknown, where: string) => {
    if (Array.isArray(t)) {
      if (t.length === 0 || t.some((v) => !isInt(v, 0, n - 1))) err(`${where}: validator indexes must be integers in [0, ${n - 1}]`);
    } else if (isObj(t) && "leaderOfSlot" in t) {
      if (!isInt(t.leaderOfSlot)) err(`${where}.leaderOfSlot must be a non-negative integer`);
    } else if (isObj(t) && "pct" in t) {
      if (!isInt(t.pct, 1, 99)) err(`${where}.pct must be an integer in [1, 99]`);
    } else err(`${where} is not a valid target`);
  };

  if (!Array.isArray(x.faults)) err("faults must be an array");
  else {
    x.faults.forEach((f, i) => {
      const w = `faults[${i}]`;
      if (!isObj(f) || typeof f.type !== "string" || !FAULT_TYPES.includes(f.type)) return err(`${w}: unknown fault type`);
      if (f.at !== undefined && !isInt(f.at)) err(`${w}.at must be a non-negative integer`);
      if (!["killLeader", "silenceLeader"].includes(f.type) && f.at === undefined) err(`${w}.at is required`);
      switch (f.type) {
        case "killLeader":
        case "silenceLeader":
          if (!isInt(f.slot)) err(`${w}.slot must be a non-negative integer`);
          if (f.windows !== undefined && !isInt(f.windows, 1, 20)) err(`${w}.windows must be an integer in [1, 20]`);
          break;
        case "kill":
        case "revive":
          if (!isInt(f.v, 0, n - 1)) err(`${w}.v must be an integer in [0, ${n - 1}]`);
          break;
        case "crashStake":
        case "partition":
          if (!isInt(f.pct, 1, 99)) err(`${w}.pct must be an integer in [1, 99]`);
          break;
        case "isolate":
          checkTarget(f.targets, `${w}.targets`);
          break;
        case "slow":
          checkTarget(f.targets, `${w}.targets`);
          if (!isInt(f.extraMs, 0, 10_000)) err(`${w}.extraMs must be an integer in [0, 10000]`);
          break;
        case "loss":
          if (!(typeof f.rate === "number" && f.rate >= 0 && f.rate <= 1)) err(`${w}.rate must be in [0, 1]`);
          if (!isInt(f.until)) err(`${w}.until must be a non-negative integer`);
          break;
      }
      for (const end of ["healAt", "reviveAt", "until"]) {
        if (f[end] !== undefined && (!isInt(f[end]) || (f[end] as number) <= (f.at as number))) err(`${w}.${end} must be an integer after at`);
      }
    });
  }

  if (!Array.isArray(x.txs)) err("txs must be an array");
  else {
    const ids = new Set<string>();
    x.txs.forEach((t, i) => {
      if (!isObj(t) || typeof t.id !== "string" || !isInt(t.sentAt)) return err(`txs[${i}] needs a string id and integer sentAt`);
      if (ids.has(t.id)) err(`txs[${i}]: duplicate id "${t.id}"`);
      ids.add(t.id);
    });
  }

  if (x.objective !== undefined) {
    const o = x.objective;
    if (!isObj(o) || !OBJECTIVES.includes(o.kind as string)) err("objective.kind is invalid");
    else if (!isInt(o.ms ?? o.points ?? o.count, 1)) err("objective needs a positive ms, points or count");
  }

  if (!Array.isArray(x.annotations)) err("annotations must be an array");
  else {
    x.annotations.forEach((a, i) => {
      if (!isObj(a) || !isInt(a.at) || typeof a.title !== "string" || typeof a.text !== "string") err(`annotations[${i}] needs at, title and text`);
    });
  }
  if (isObj(x)) validateBounds(x, err);
  return errs;
}

/** Parse + validate a scenario from JSON text. Throws one Error listing every problem. */
export function parseScenario(json: string): Scenario {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (e) {
    throw new Error(`invalid scenario JSON: ${(e as Error).message}`);
  }
  const errs = validateScenario(data);
  if (errs.length) throw new Error(`invalid scenario:\n- ${errs.join("\n- ")}`);
  return data as Scenario;
}
