import { expect, test } from "vitest";
import { setup } from "./helpers";
import { NET_LOSS } from "../faults";

function run(seed: number, rate = 0.3) {
  const e = setup({ jitterMs: 25, validators: 16 }, seed);
  e.schedule(0, "world", NET_LOSS, { rate });
  for (let i = 0; i < 16; i++) e.schedule(i * 7, "world", "go", { from: i });
  e.runUntil(5000);
  return e;
}

test("same seed gives identical deliveries and trace, even with loss and jitter", () => {
  const a = run(21), b = run(21);
  expect(a.state.got.length > 50).toBe(true);
  expect(a.state.got).toEqual(b.state.got);
  expect(a.trace.entries).toEqual(b.trace.entries);
});

test("different seed gives different outcomes", () => {
  expect(run(21).state.got).not.toEqual(run(22).state.got);
});

test("loss rate 1 drops everything; rate 0 drops nothing", () => {
  expect(run(3, 1).state.got.length).toBe(0);
  expect(run(3, 0).state.got.length).toBe(16 * 15);
});

test("snapshot mid-flight, restore, and replay reproduces deliveries", () => {
  const e = setup({ jitterMs: 20 }, 5);
  for (let i = 0; i < 8; i++) e.schedule(i * 3, "world", "go", { from: i });
  e.runUntil(10);
  const snap = e.snapshot();
  e.runUntil(2000);
  const expected = structuredClone(e.state.got);
  e.restore(snap);
  e.runUntil(2000);
  expect(e.state.got).toEqual(expected);
});
