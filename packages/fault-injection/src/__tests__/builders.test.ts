import { expect, test } from "vitest";
import { leaderForSlot } from "@alpenchaos/network-simulator";
import { slotStatus } from "@alpenchaos/protocol-alpenglow";
import {
  crashStake, injectFaults, killLeader, lossBurst, mergeScripts, partitionStake,
  pickByStake, silenceLeader, slowValidators, windowStart, kill,
} from "../index";
import { agState, build, start } from "./helpers";

const stake = (e: ReturnType<typeof build>, vs: number[]) => vs.reduce((s, v) => s + e.state.net.validators[v]!.stake, 0);

test("pickByStake takes the smallest set reaching the percentage, exactly", () => {
  const e = build();
  const { net } = e.state;
  for (const from of ["top", "bottom"] as const) {
    const picked = pickByStake(net, 30, from);
    expect(stake(e, picked) * 100 >= net.totalStake * 30).toBe(true);
    expect(stake(e, picked.slice(0, -1)) * 100 < net.totalStake * 30).toBe(true);
  }
  expect(pickByStake(net, 0)).toEqual([]);
});

test("windowStart and killLeader resolve the right validator and time", () => {
  const e = build();
  const { net } = e.state;
  expect(windowStart(net, 6)).toBe(1600);
  const s = killLeader(net, 6);
  expect(s).toEqual([
    { at: 1600, kind: "net:kill", payload: { v: leaderForSlot(net, 6) }, label: `kill v${leaderForSlot(net, 6)}` },
  ]);
});

test("mergeScripts orders by time and keeps given order for ties", () => {
  const m = mergeScripts(kill(1, 500), kill(2, 100), kill(3, 500));
  expect(m.map((x) => (x.payload as { v: number }).v)).toEqual([2, 1, 3]);
});

test("injectFaults rejects events in the past and accepts mid-run injection", () => {
  const e = build();
  start(e);
  e.runUntil(1000);
  expect(() => injectFaults(e, kill(0, 500))).toThrow();
  injectFaults(e, kill(0, 2000)); // v0 is the leader of slots 0-3 and a big validator
  e.runUntil(2100);
  expect(e.state.net.validators[0]!.up).toBe(false);
  expect(e.trace.entries.some((t) => t.kind === "fault:kill" && t.time === 2000)).toBe(true);
});

test("crashStake past 40% stalls Alpenglow after the crash time, not before", () => {
  const e = build();
  injectFaults(e, crashStake(e.state.net, 41, { at: 2000, from: "top" }));
  start(e);
  e.runUntil(5000);
  expect(slotStatus(agState(e), 2)!.status).toBe("finalized");
  expect(slotStatus(agState(e), 8)).toBe(undefined);
});

test("partitionStake with healAt: stalls while split, finalizes after healing", () => {
  const e = build();
  injectFaults(e, partitionStake(e.state.net, 45, { at: 0, healAt: 2000 }));
  start(e);
  e.runUntil(1999);
  expect(Object.keys(agState(e).global).length).toBe(0);
  e.runUntil(4400);
  expect(slotStatus(agState(e), 8)!.status).toBe("finalized");
});

test("silenceLeader: its window is skipped, the leader comes back alive", () => {
  const e = build();
  const { net } = e.state;
  const l = leaderForSlot(net, 4);
  injectFaults(e, silenceLeader(net, 4));
  start(e);
  e.runUntil(4500);
  for (let s = 4; s <= 7; s++) expect(slotStatus(agState(e), s)!.status).toBe("skipped");
  expect(slotStatus(agState(e), 8)!.status).toBe("finalized");
  expect(net.validators[l]!.up).toBe(true);
});

test("slowValidators and lossBurst produce the expected events", () => {
  expect(slowValidators([1, 2], 200, { at: 100, until: 900 }).map((x) => [x.at, (x.payload as { extraMs: number }).extraMs])).toEqual([
    [100, 200], [100, 200], [900, 0], [900, 0],
  ]);
  expect(lossBurst(0.5, { at: 10, until: 20 }).map((x) => [x.at, (x.payload as { rate: number }).rate])).toEqual([[10, 0.5], [20, 0]]);
});
