import type { Scenario } from "./types";

const FAULT_TYPES = ["killLeader", "silenceLeader", "kill", "revive", "crashStake", "partition", "isolate", "heal", "slow", "loss"];
const OBJECTIVES = ["stall", "chaosScore", "txLost"];

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isInt = (x: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): x is number =>
  typeof x === "number" && Number.isInteger(x) && x >= min && x <= max;

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
