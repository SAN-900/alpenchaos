import { expect, test } from "vitest";
import { receivers, setup } from "./helpers";
import { NET_HEAL, NET_KILL, NET_PARTITION, NET_DELAY } from "../faults";

test("broadcast reaches every other validator, no earlier than base latency", () => {
  const e = setup();
  e.schedule(0, "world", "go", { from: 0 });
  e.runUntil(1000);
  expect(receivers(e)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  for (const g of e.state.got) expect(g.time >= e.state.net.baseLatency[g.from]![g.to]!).toBe(true);
});

test("a dead sender sends nothing", () => {
  const e = setup();
  e.schedule(0, "world", NET_KILL, { v: 0 });
  e.schedule(0, "world", "go", { from: 0 });
  e.runUntil(1000);
  expect(e.state.got.length).toBe(0);
});

test("a receiver killed while a message is in flight never gets it", () => {
  const e = setup();
  e.schedule(0, "world", "go", { from: 0 });
  e.schedule(1, "world", NET_KILL, { v: 3 }); // min latency is >= 5ms
  e.runUntil(1000);
  expect(receivers(e)).toEqual([1, 2, 4, 5, 6, 7]);
  expect(e.trace.entries.some((t:any) => t.kind === "net:drop" && t.reason === "receiver-down")).toBe(true);
});

test("partition blocks cross-group traffic until healed", () => {
  const e = setup();
  e.schedule(0, "world", NET_PARTITION, { groups: [[0, 1, 2, 3]] });
  e.schedule(0, "world", "go", { from: 0 });
  e.runUntil(500);
  expect(receivers(e)).toEqual([1, 2, 3]);

  e.schedule(0, "world", NET_HEAL, {});
  e.schedule(0, "world", "go", { from: 0 });
  e.runUntil(1000);
  expect(e.state.got.length).toBe(3 + 7);
});

test("a partition raised mid-flight drops messages already sent", () => {
  const e = setup();
  e.schedule(0, "world", "go", { from: 0 });
  e.schedule(1, "world", NET_PARTITION, { groups: [[0]] });
  e.runUntil(1000);
  expect(e.state.got.length).toBe(0);
});

test("extra delay on a validator slows its messages", () => {
  const base = setup();
  base.schedule(0, "world", "go", { from: 0 });
  base.runUntil(2000);
  const slow = setup();
  slow.schedule(0, "world", NET_DELAY, { v: 0, extraMs: 300 });
  slow.schedule(0, "world", "go", { from: 0 });
  slow.runUntil(2000);
  const t = (e: typeof base) => Math.min(...e.state.got.map((g:any) => g.time));
  expect(t(slow) >= t(base) + 300).toBe(true);
});

test("invalid fault payloads throw", () => {
  const e = setup();
  e.schedule(0, "world", NET_KILL, { v: 99 });
  expect(() => e.runUntil(10)).toThrow();
});
