import { expect, test } from "vitest";
import { Rng } from "@alpenchaos/simulation-core";
import { createNetwork } from "../network";
import { leaderForSlot } from "../leader";

test("latency matrix is symmetric, zero diagonal, positive elsewhere", () => {
  const net = createNetwork({ validators: 12 }, new Rng(4));
  const m = net.baseLatency;
  for (let i = 0; i < 12; i++) {
    expect(m[i]![i]).toBe(0);
    for (let j = 0; j < 12; j++) {
      expect(m[i]![j]).toBe(m[j]![i]);
      if (i !== j) expect(m[i]![j]! >= 5).toBe(true);
    }
  }
});

test("same seed builds the same network; different seed differs", () => {
  const a = createNetwork({ validators: 10 }, new Rng(9));
  const b = createNetwork({ validators: 10 }, new Rng(9));
  const c = createNetwork({ validators: 10 }, new Rng(10));
  expect(a).toEqual(b);
  expect(a).not.toEqual(c);
});

test("leader schedule is stake-weighted and stable per window", () => {
  const net = createNetwork({ validators: 8, leaderWindows: 4000 }, new Rng(2));
  const count = new Array<number>(8).fill(0);
  for (const l of net.leaderSchedule) count[l] = count[l]! + 1;
  expect(count[0]! > count[7]! * 2).toBe(true);
  // all 4 slots of a window share a leader
  expect(leaderForSlot(net, 8)).toBe(leaderForSlot(net, 11));
});
