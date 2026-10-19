import { describe, expect, test } from "vitest";
import { getScenario, listScenarios, runScenario } from "@alpenchaos/scenarios";
import { LANE_SLOTS, SimDriver } from "../driver";
import { describeOutcome, fmtClock, fmtMs, speedup } from "../format";

const drive = (id: string, until?: number) => {
  const d = new SimDriver(getScenario(id)!);
  if (until !== undefined) d.advanceTo(until);
  return d;
};

describe("SimDriver", () => {
  test("starts at t=0 with an empty, well-formed frame", () => {
    const f = drive("baseline").frame();
    expect(f.now).toBe(0);
    expect(f.slot).toBe(0);
    expect(f.done).toBe(false);
    expect(f.validators).toHaveLength(24);
    expect(f.ag.cells).toHaveLength(1);
    expect(f.ag.cells[0]!.state).toBe("pending");
  });

  test("baseline: Alpenglow decides slots within ~a second, legacy is still waiting", () => {
    const f = drive("baseline", 5000).frame();
    expect(f.now).toBe(5000);
    expect(f.ag.cells.slice(0, 8).every((c) => c.state === "finalized")).toBe(true);
    expect(f.ag.cells[0]!.path).toBe("fast");
    expect(f.ag.stats.medianMs!).toBeLessThan(400);
    expect(f.tb.cells.every((c) => c.state === "pending")).toBe(true);
    expect(f.tb.stats.medianMs).toBeNull();
  });

  test("legacy finally finalizes around 12 s", () => {
    const f = drive("baseline", 16_000).frame();
    expect(f.tb.stats.medianMs!).toBeGreaterThan(11_000);
    expect(f.tb.cells.some((c) => c.state === "finalized")).toBe(true);
  });

  test("lanes show at most LANE_SLOTS cells and slide with time", () => {
    const f = drive("baseline", 25_000).frame();
    expect(f.ag.cells).toHaveLength(LANE_SLOTS);
    expect(f.ag.cells[LANE_SLOTS - 1]!.slot).toBe(f.slot);
  });

  test("leader-kill: the silenced window is skipped, with no blocks", () => {
    const f = drive("leader-kill", 8000).frame();
    const w = f.ag.cells.filter((c) => c.slot >= 8 && c.slot <= 11);
    expect(w.map((c) => c.state)).toEqual(["skipped", "skipped", "skipped", "skipped"]);
    expect(w.every((c) => !c.hasBlock)).toBe(true);
    expect(f.ag.stats.skipped).toBe(4);
  });

  test("ghost-bank: skipped slots that did have a block are flagged", () => {
    const f = drive("ghost-bank", 8000).frame();
    const ghosts = f.ag.cells.filter((c) => c.state === "skipped" && c.hasBlock);
    expect(ghosts.length).toBeGreaterThan(0);
  });

  test("timeline: faults and annotations appear when their time comes", () => {
    const d = drive("leader-kill", 3000);
    expect(d.frame().events).toHaveLength(0);
    d.advanceTo(3300);
    const titles = d.frame().events.map((e) => e.title);
    expect(titles).toContain("Leader crashes");
    expect(titles.some((t) => t.startsWith("kill v"))).toBe(true);
    expect(d.frame().events.map((e) => e.at)).toEqual([...d.frame().events.map((e) => e.at)].sort((a, b) => a - b));
  });

  test("validators reflect faults (crash, partition)", () => {
    const k = drive("leader-kill", 3500).frame();
    expect(k.validators.filter((v) => !v.up)).toHaveLength(1);
    const p = drive("partition-20", 6000).frame();
    expect(p.validators.some((v) => v.group !== 0)).toBe(true);
    drive("partition-20", 25_000).frame().validators.forEach((v) => expect(v.group).toBe(0));
  });

  test("dots: only messages in flight, sampled, always valid", () => {
    const d = drive("baseline", 2000);
    const f = d.frame();
    expect(f.dots.length).toBeGreaterThan(0);
    expect(f.dots.length).toBeLessThan(1500);
    for (const x of f.dots) {
      expect(x.sentAt).toBeLessThanOrEqual(f.now);
      expect(x.arriveAt).toBeGreaterThan(f.now);
      expect(x.from).not.toBe(x.to);
    }
  });

  test("tx fates match the headless report at the end of the run", () => {
    for (const id of ["ghost-bank", "late-tx", "laggy-leader"]) {
      const s = getScenario(id)!;
      const d = new SimDriver(s);
      d.advanceTo(s.durationMs);
      const rep = runScenario(s);
      expect(d.frame().txs.map((t) => ({ id: t.id, ag: t.ag, tb: t.tb }))).toEqual(rep.txs);
    }
  });

  test("seeking backwards gives exactly the frame you would have got going forward", () => {
    const fresh = JSON.stringify(drive("rolling-blackout", 9000).frame());
    const d = drive("rolling-blackout", 20_000);
    d.seek(9000);
    expect(JSON.stringify(d.frame())).toBe(fresh);
    d.seek(0);
    expect(d.frame().now).toBe(0);
  });

  test("advancing in many small steps equals one big step", () => {
    const a = drive("partition-20");
    for (let t = 33; t <= 12_000; t += 33) a.advanceTo(t);
    a.advanceTo(12_000);
    expect(JSON.stringify(a.frame())).toBe(JSON.stringify(drive("partition-20", 12_000).frame()));
  });

  test("clamps at the scenario duration and reports done", () => {
    const s = getScenario("baseline")!;
    const d = drive("baseline");
    d.advanceTo(s.durationMs * 2);
    expect(d.now).toBe(s.durationMs);
    expect(d.frame().done).toBe(true);
  });

  test("every preset can be played to the end without throwing", () => {
    for (const s of listScenarios()) {
      const d = new SimDriver(s);
      for (let t = 250; t <= s.durationMs; t += 250) d.advanceTo(t);
      expect(d.frame().done).toBe(true);
    }
  });

  test("dots off (lite mode): no messages collected, every other result identical", () => {
    for (const id of ["baseline", "ghost-bank", "partition-20"]) {
      const s = getScenario(id)!;
      const full = new SimDriver(s);
      const lite = new SimDriver(s, { dots: false });
      full.advanceTo(15_000);
      lite.advanceTo(15_000);
      expect(full.frame().dots.length).toBeGreaterThan(0);
      expect(lite.frame().dots).toEqual([]);
      expect(JSON.stringify({ ...lite.frame(), dots: [] })).toBe(JSON.stringify({ ...full.frame(), dots: [] }));
    }
  });

  test("frame is cached while time stands still", () => {
    const d = drive("baseline", 1000);
    expect(d.frame()).toBe(d.frame());
    d.advanceTo(1100);
    expect(d.frame().now).toBe(1100);
  });
});

describe("format", () => {
  test("durations", () => {
    expect(fmtMs(204)).toBe("204 ms");
    expect(fmtMs(12_480)).toBe("12.5 s");
    expect(fmtMs(null)).toBe("-");
    expect(fmtClock(65_400)).toBe("1:05.4");
    expect(fmtClock(900)).toBe("0:00.9");
  });
  test("speedup", () => {
    expect(speedup(200, 12_000)).toBe(60);
    expect(speedup(null, 12_000)).toBeNull();
    expect(speedup(0, 5)).toBeNull();
  });
  test("outcomes", () => {
    expect(describeOutcome({ status: "landed", includedSlot: 1, confirmedAt: 600, latencyMs: 500 })).toEqual({ label: "landed in 500 ms", tone: "good" });
    expect(describeOutcome({ status: "abandoned", includedSlot: 8, decidedAt: 1, retryable: false }).tone).toBe("bad");
    expect(describeOutcome({ status: "pending" }).tone).toBe("wait");
  });
});
