import { expect, test } from "vitest";
import { Engine } from "../engine";
import { toyDispatch, type ToyState } from "./toy";

function seeded(seed: number) {
  const e = new Engine<ToyState>({ count: 0 }, toyDispatch, seed);
  for (let i = 0; i < 20; i++) e.schedule(i % 3, `v${i % 5}`, "ping", { depth: 0 });
  return e;
}

test("restore + rerun reproduces the same trace", () => {
  const e = seeded(5);
  e.runUntil(5);
  const snap = e.snapshot();
  e.trace.drain();
  e.runUntil(50);
  const expected = e.trace.drain();
  const finalCount = e.state.count;
  expect(expected.length).toBeGreaterThan(0);

  e.restore(snap);
  e.runUntil(50);
  expect(e.trace.drain()).toEqual(expected);
  expect(e.state.count).toBe(finalCount);
});

test("snapshot is isolated from later mutation and reusable", () => {
  const e = seeded(8);
  e.runUntil(3);
  const snap = e.snapshot();
  const countAtSnap = e.state.count;
  e.runUntil(40);
  e.restore(snap);
  expect(e.state.count).toBe(countAtSnap);
  e.runUntil(40);
  const first = e.state.count;
  e.restore(snap);
  e.runUntil(40);
  expect(e.state.count).toBe(first);
});

test("fork: injecting an event diverges only after the injection time", () => {
  const base = seeded(9);
  base.runUntil(4);
  const snap = base.snapshot();

  base.trace.drain();
  base.runUntil(60);
  const original = base.trace.drain();

  const fork = seeded(9);
  fork.restore(snap);
  fork.schedule(2, "v0", "ping", { depth: 0 }); // injected at t = 4 + 2 = 6
  fork.runUntil(60);
  const forked = fork.trace.drain();

  const before = (t: { time: number }[]) => t.filter((x) => x.time < 6);
  expect(before(forked)).toEqual(before(original));
  expect(forked).not.toEqual(original);
});
