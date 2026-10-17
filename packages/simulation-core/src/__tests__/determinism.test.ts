import { expect, test } from "vitest";
import { Engine } from "../engine";
import { toyDispatch, type ToyState } from "./toy";

function run(seed: number) {
  const e = new Engine<ToyState>({ count: 0 }, toyDispatch, seed);
  for (let i = 0; i < 20; i++) e.schedule(0, `v${i % 5}`, "ping", { depth: 0 });
  e.runUntil(10_000);
  return { trace: e.trace.entries, count: e.state.count };
}

test("same seed gives an identical trace", () => {
  const a = run(123), b = run(123);
  expect(a.count).toBeGreaterThan(200);
  expect(a.trace).toEqual(b.trace);
});

test("different seed gives a different trace", () => {
  expect(run(123).trace).not.toEqual(run(124).trace);
});

test("trace times never go backwards", () => {
  const { trace } = run(77);
  for (let i = 1; i < trace.length; i++) expect(trace[i]!.time >= trace[i - 1]!.time).toBe(true);
});
