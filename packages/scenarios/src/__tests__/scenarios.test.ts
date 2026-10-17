import { describe, expect, test } from "vitest";
import {
  SCENARIOS,
  buildNetwork,
  createScenarioSession,
  dailyScenario,
  evaluateObjective,
  getScenario,
  parseScenario,
  resolveFaults,
  runScenario,
  validateScenario,
  type Scenario,
  type ScenarioReport,
} from "../index";

const get = (id: string): Scenario => {
  const s = getScenario(id);
  if (!s) throw new Error(`missing scenario ${id}`);
  return s;
};
// Legacy needs ~13-15 s to settle a slot, so leave a generous margin for fair lane stats.
const run = (id: string): ScenarioReport => runScenario(get(id), { settleMs: 15_000 });
const tx = (r: ScenarioReport, id: string) => r.txs.find((t) => t.id === id)!;

describe("registry", () => {
  test("ids are unique and every preset validates", () => {
    const ids = SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SCENARIOS) expect(validateScenario(s)).toEqual([]);
  });

  test("presets survive a JSON round trip", () => {
    for (const s of SCENARIOS) expect(parseScenario(JSON.stringify(s))).toEqual(s);
  });

  test("getScenario finds by id", () => {
    expect(getScenario("baseline")?.name).toBe("Business as usual");
    expect(getScenario("nope")).toBeUndefined();
  });
});

describe("resolveFaults", () => {
  test("is pure and deterministic", () => {
    const s = get("leader-kill");
    expect(resolveFaults(buildNetwork(s), s.faults)).toEqual(resolveFaults(buildNetwork(s), s.faults));
  });

  test("silenceLeader crashes the slot's leader at its window start and revives it before the next", () => {
    const s = get("leader-kill");
    const script = resolveFaults(buildNetwork(s), s.faults);
    expect(script).toHaveLength(2);
    expect(script[0]).toMatchObject({ at: 3200, kind: "net:kill" });
    expect(script[1]).toMatchObject({ at: 4799, kind: "net:revive" });
  });

  test("partition cuts off about pct% of stake, not the overshoot of the top validators", () => {
    const s = get("partition-20");
    const net = buildNetwork(s);
    const group = (resolveFaults(net, s.faults)[0]!.payload as { groups: number[][] }).groups[0]!;
    const share = (group.reduce((a, i) => a + net.validators[i]!.stake, 0) * 100) / net.totalStake;
    expect(share).toBeGreaterThanOrEqual(20);
    expect(share).toBeLessThan(25);
  });

  test("leaderOfSlot targets resolve to that slot's leader", () => {
    const s = get("ghost-bank");
    const net = buildNetwork(s);
    const [cut] = resolveFaults(net, s.faults);
    const leaders = (cut!.payload as { groups: number[][] }).groups[0]!;
    expect(leaders).toHaveLength(1);
    expect(leaders[0]).toBe(net.leaderSchedule[Math.floor(8 / net.slotsPerWindow)]);
  });
});

describe("headless runs", () => {
  test("same scenario, same report", () => {
    expect(runScenario(get("ghost-bank"))).toEqual(runScenario(get("ghost-bank")));
  });

  test("baseline: Alpenglow is all fast path and sub-second; legacy takes ~12 s", () => {
    const r = run("baseline");
    expect(r.ag.skipped).toBe(0);
    expect(r.ag.pending).toBe(0);
    expect(r.ag.fast).toBe(r.ag.finalized);
    expect(r.ag.p95Ms!).toBeLessThan(400);
    expect(r.tb.medianMs!).toBeGreaterThan(11_000);
  });

  test("leader-kill: exactly one window is skipped, nothing is left undecided", () => {
    const r = run("leader-kill");
    expect(r.ag.skipped).toBe(4);
    expect(r.ag.pending).toBe(0);
    expect(r.agLongestGapMs).toBe(0);
    expect(tx(r, "before").ag.status).toBe("landed");
  });

  test("ghost-bank: the tx is abandoned on both protocols, Alpenglow knows ~13 s sooner", () => {
    const r = run("ghost-bank");
    const g = tx(r, "ghosted");
    expect(tx(r, "lands-fine").ag.status).toBe("landed");
    expect(g.ag.status).toBe("abandoned");
    expect(g.tb.status).toBe("abandoned");
    if (g.ag.status === "abandoned" && g.tb.status === "abandoned") {
      expect(g.ag.decidedAt).toBeLessThan(5_000);
      expect(g.tb.decidedAt).toBeGreaterThan(12_000);
    }
  });

  test("laggy-leader: Alpenglow skips the slow block, legacy waits and lands it", () => {
    const r = run("laggy-leader");
    const t = tx(r, "too-slow");
    expect(t.ag.status).toBe("abandoned");
    expect(t.tb.status).toBe("landed");
  });

  test("late-tx: landed, dropped, abandoned and expired in one run", () => {
    const r = run("late-tx");
    expect(tx(r, "healthy").ag.status).toBe("landed");
    expect(tx(r, "dead-leader").ag.status).toBe("dropped");
    expect(tx(r, "ghosted").ag.status).toBe("abandoned");
    expect(tx(r, "stale-blockhash").ag.status).toBe("expired");
  });

  test("fast-path-denied: slow path takes over and finality gets slower but never stops", () => {
    const r = run("fast-path-denied");
    const base = run("baseline");
    expect(r.ag.slow).toBeGreaterThan(r.ag.fast);
    expect(r.ag.medianMs!).toBeGreaterThan(base.ag.medianMs!);
    expect(r.ag.medianMs!).toBeLessThan(1_000);
    expect(r.agLongestGapMs).toBe(0);
  });

  test("partition-20: the chain keeps finalizing on the slow path", () => {
    const r = run("partition-20");
    expect(r.ag.pending).toBe(0);
    expect(r.ag.slow).toBeGreaterThan(r.ag.fast);
    expect(tx(r, "mid-split").ag.status).toBe("landed");
  });

  test("twenty-twenty: degraded but live, well under legacy", () => {
    const r = run("twenty-twenty");
    expect(r.ag.finalized).toBeGreaterThan(25);
    expect(r.ag.medianMs!).toBeLessThan(2_000);
    expect(r.tb.medianMs!).toBeGreaterThan(r.ag.medianMs! * 5);
  });

  test("rolling-blackout: twelve skipped slots in a row, then straight back to normal", () => {
    const r = run("rolling-blackout");
    expect(r.ag.skipped).toBe(12);
    expect(r.agLongestGapMs).toBe(0);
    expect(tx(r, "mid-blackout").ag.status).toBe("dropped");
    expect(tx(r, "after").ag.status).toBe("landed");
  });

  test("partition-40: finality stalls for the length of the split", () => {
    const r = run("partition-40");
    expect(r.agLongestGapMs).toBeGreaterThanOrEqual(7_000);
    expect(tx(r, "caught-in-the-split").ag.status).toBe("pending");
  });
});

describe("play mode", () => {
  test("scenario faults run as background noise and score for chaos", () => {
    const s = createScenarioSession(get("leader-kill"));
    s.advance(8_000);
    expect(s.game.players.chaos.score).toBeGreaterThan(0);
    expect(s.game.over).toBeUndefined();
  });

  test("scripted txs are registered and scored", () => {
    const s = createScenarioSession(get("ghost-bank"));
    expect(s.game.txs).toHaveLength(2);
    s.advance(10_000);
    const outcomes = s.game.txs.map((t) => t.outcome?.status);
    expect(outcomes).toEqual(["landed", "abandoned"]);
  });

  test("scenario duration and tx config reach the game", () => {
    const s = createScenarioSession(get("late-tx"));
    expect(s.game.cfg.durationMs).toBe(35_000);
    expect(s.game.cfg.tx.maxAgeSlots).toBe(20);
  });

  test("a scenario's match is reproducible from its seed", () => {
    const a = createScenarioSession(get("partition-20"));
    const b = createScenarioSession(get("partition-20"));
    a.advance(12_000);
    b.advance(12_000);
    expect(a.game.players).toEqual(b.game.players);
    expect(a.engine.rng.getState()).toBe(b.engine.rng.getState());
  });

  test("objectives report progress", () => {
    const s = createScenarioSession(get("partition-40"));
    s.advance(10_000);
    const st = evaluateObjective(s.game, { kind: "stall", ms: 3_000 });
    expect(st.met).toBe(true);
    expect(st.progress).toBe(1);
    expect(evaluateObjective(s.game, { kind: "txLost", count: 2 }).met).toBe(false);
  });
});

describe("daily", () => {
  test("same date gives the same scenario; different dates differ", () => {
    expect(dailyScenario("2026-10-17")).toEqual(dailyScenario("2026-10-17"));
    expect(dailyScenario("2026-10-17").seed).not.toBe(dailyScenario("2026-10-18").seed);
    expect(dailyScenario(new Date("2026-10-17T23:59:59Z")).id).toBe("daily-2026-10-17");
  });

  test("a month of dailies are all valid and playable", () => {
    for (let d = 1; d <= 30; d++) {
      const s = dailyScenario(`2026-11-${String(d).padStart(2, "0")}`);
      expect(validateScenario(s)).toEqual([]);
      const session = createScenarioSession(s);
      session.advance(5_000);
      expect(session.now).toBe(5_000);
    }
  });

  test("rejects malformed dates", () => {
    expect(() => dailyScenario("17/10/2026")).toThrow();
  });
});

describe("validation", () => {
  const ok = () => JSON.parse(JSON.stringify(get("baseline")));

  test("accepts a known-good scenario", () => {
    expect(validateScenario(ok())).toEqual([]);
  });

  test("reports every problem it finds", () => {
    const bad = ok();
    bad.seed = -1;
    bad.network.validators = 1000;
    bad.faults = [
      { type: "kill", v: 99, at: 10 },
      { type: "explode", at: 5 },
      { type: "partition", pct: 150, at: 5 },
      { type: "slow", targets: [], extraMs: 5, at: 1 },
    ];
    const errs = validateScenario(bad);
    expect(errs.length).toBeGreaterThanOrEqual(5);
  });

  test("parseScenario throws on garbage", () => {
    expect(() => parseScenario("{nope")).toThrow();
    expect(() => parseScenario("[]")).toThrow();
  });
});
