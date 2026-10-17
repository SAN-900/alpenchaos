import { expect, test } from "vitest";
import { NET_HEAL, NET_PARTITION } from "@alpenchaos/network-simulator";
import { slotStatus } from "../index";
import { ag, build, kill, leader, start } from "./helpers";

test("healthy network: every slot finalizes on the fast path in under a slot", () => {
  const e = build();
  start(e);
  e.runUntil(4000);
  for (let s = 0; s <= 8; s++) {
    const g = slotStatus(ag(e), s)!;
    expect(g.status).toBe("finalized");
    expect(g.path).toBe("fast");
    expect(g.latencyMs > 0 && g.latencyMs < 400).toBe(true);
  }
});

test("dead leader: its slots are skipped after the timeout, other slots still finalize", () => {
  const e = build();
  const dead = leader(e, 4);
  kill(e, dead);
  start(e);
  e.runUntil(4500);
  let sawSkip = false, sawFinal = false;
  for (let s = 0; s <= 8; s++) {
    const g = slotStatus(ag(e), s)!;
    if (leader(e, s) === dead) {
      expect(g.status).toBe("skipped");
      expect(g.latencyMs >= 450 && g.latencyMs < 450 + 400).toBe(true);
      sawSkip = true;
    } else {
      expect(g.status).toBe("finalized");
      sawFinal = true;
    }
  }
  expect(sawSkip && sawFinal).toBe(true);
});

test("60-80% stake alive: finality falls back to the slower two-round path", () => {
  const e = build();
  const { net } = e.state;
  let alive = net.totalStake;
  for (let v = net.validators.length - 1; v >= 0 && alive * 100 >= net.totalStake * 80; v--) {
    kill(e, v);
    alive -= net.validators[v]!.stake;
  }
  expect(alive * 100 < net.totalStake * 80 && alive * 100 >= net.totalStake * 60).toBe(true);
  start(e);
  e.runUntil(4500);
  let finalized = 0;
  for (let s = 0; s <= 8; s++) {
    const g = slotStatus(ag(e), s)!;
    if (net.validators[leader(e, s)]!.up) {
      expect(g.status).toBe("finalized");
      expect(g.path).toBe("slow");
      finalized++;
    } else {
      expect(g.status).toBe("skipped");
    }
  }
  expect(finalized > 0).toBe(true);
});

test("<60% stake alive: nothing finalizes and nothing is skipped (stall)", () => {
  const e = build();
  const { net } = e.state;
  let alive = net.totalStake;
  for (let v = 0; v < net.validators.length && alive * 100 >= net.totalStake * 60; v++) {
    kill(e, v);
    alive -= net.validators[v]!.stake;
  }
  expect(alive * 100 < net.totalStake * 60).toBe(true);
  start(e);
  e.runUntil(4000);
  expect(Object.keys(ag(e).global).length).toBe(0);
});

test("partition into two sub-60% halves stalls; slots after healing finalize again", () => {
  const e = build();
  const { net } = e.state;
  const groupA = [0, 1, 2, 3, 4, 5];
  const a = groupA.reduce((s, v) => s + net.validators[v]!.stake, 0);
  expect(a * 100 < net.totalStake * 60 && (net.totalStake - a) * 100 < net.totalStake * 60).toBe(true);
  e.schedule(0, "world", NET_PARTITION, { groups: [groupA] });
  start(e);
  e.runUntil(1999);
  expect(Object.keys(ag(e).global).length).toBe(0);
  e.schedule(1, "world", NET_HEAL, {});
  e.runUntil(4400);
  expect(slotStatus(ag(e), 8)!.status).toBe("finalized");
});

test("deterministic with loss and jitter; snapshot mid-run replays identically", () => {
  const run = () => {
    const e = build({ lossRate: 0.03, jitterMs: 30 }, 7);
    start(e);
    e.runUntil(5000);
    return e;
  };
  const a = run(), b = run();
  expect(Object.keys(ag(a).global).length > 5).toBe(true);
  expect(ag(a).global).toEqual(ag(b).global);
  expect(a.trace.entries).toEqual(b.trace.entries);

  const e = build({ lossRate: 0.03, jitterMs: 30 }, 7);
  start(e);
  e.runUntil(1500);
  const snap = e.snapshot();
  e.runUntil(5000);
  const expected = structuredClone(ag(e).global);
  e.restore(snap);
  e.runUntil(5000);
  expect(ag(e).global).toEqual(expected);
});
