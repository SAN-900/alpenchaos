import { expect, test } from "vitest";
import { slotStatus } from "@alpenchaos/protocol-alpenglow";
import { legacyStatus, optimisticStatus } from "../index";
import { ag, build, kill, leader, start, tb } from "./helpers";

test("healthy: legacy roots a slot after ~32 slots (~12.5s); Alpenglow is >30x faster", () => {
  const e = build();
  start(e);
  e.runUntil(20000);
  for (let s = 0; s <= 10; s++) {
    const l = legacyStatus(tb(e), s)!;
    const a = slotStatus(ag(e), s)!;
    expect(l.status).toBe("finalized");
    expect(l.latencyMs).toBeGreaterThan(12000);
    expect(l.latencyMs).toBeLessThan(13500);
    expect(a.latencyMs).toBeLessThan(400);
    expect(l.latencyMs / a.latencyMs).toBeGreaterThan(30);
  }
});

test("optimistic confirmation precedes legacy finality", () => {
  const e = build();
  start(e);
  e.runUntil(20000);
  for (let s = 0; s <= 10; s++) {
    const o = optimisticStatus(tb(e), s)!;
    expect(o.latencyMs).toBeLessThan(legacyStatus(tb(e), s)!.latencyMs);
  }
});

test("each validator's tower stays 31 deep and keeps rooting", () => {
  const e = build();
  start(e);
  e.runUntil(20000);
  const pv = tb(e).vals[3]!;
  expect(pv.tower.length).toBe(31);
  expect(pv.root).toBeGreaterThan(10);
});

test("dead leader: skipped slots are only learned ~13s later, in legacy; Alpenglow skips in <1s", () => {
  const e = build();
  const dead = leader(e, 4);
  kill(e, dead);
  start(e);
  e.runUntil(40000);
  let skips = 0;
  for (let s = 0; s <= 8; s++) {
    const l = legacyStatus(tb(e), s)!;
    const a = slotStatus(ag(e), s)!;
    if (leader(e, s) === dead) {
      expect(l.status).toBe("skipped");
      expect(a.status).toBe("skipped");
      expect(l.latencyMs).toBeGreaterThan(12000);
      expect(a.latencyMs).toBeLessThan(1000);
      skips++;
    } else {
      expect(l.status).toBe("finalized");
      expect(a.status).toBe("finalized");
    }
  }
  expect(skips).toBeGreaterThan(0);
});

test("between 60% and 66.7% stake alive: legacy halts, Alpenglow keeps finalizing", () => {
  const e = build();
  const { net } = e.state;
  let alive = net.totalStake;
  for (let v = net.validators.length - 1; v >= 0 && alive * 3 >= net.totalStake * 2; v--) {
    kill(e, v);
    alive -= net.validators[v]!.stake;
  }
  expect(alive * 3 < net.totalStake * 2 && alive * 10 >= net.totalStake * 6).toBe(true);
  start(e);
  e.runUntil(30000);
  expect(Object.keys(tb(e).global).length).toBe(0);
  expect(Object.keys(tb(e).optimistic).length).toBe(0);
  expect(Object.keys(ag(e).global).length).toBeGreaterThan(20);
});

test("deterministic with loss; snapshot mid-run replays identically", () => {
  const run = () => {
    const e = build({ lossRate: 0.02, jitterMs: 25 }, 7);
    start(e);
    e.runUntil(20000);
    return e;
  };
  const a = run(), b = run();
  expect(Object.keys(tb(a).global).length).toBeGreaterThan(5);
  expect(tb(a).global).toEqual(tb(b).global);
  expect(a.trace.entries).toEqual(b.trace.entries);

  const e = build({ lossRate: 0.02, jitterMs: 25 }, 7);
  start(e);
  e.runUntil(3000);
  const snap = e.snapshot();
  e.runUntil(20000);
  const expected = structuredClone(tb(e).global);
  e.restore(snap);
  e.runUntil(20000);
  expect(tb(e).global).toEqual(expected);
});
