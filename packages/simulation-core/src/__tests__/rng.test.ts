import { expect, test } from "vitest";
import { Rng } from "../rng";

test("same seed gives same sequence", () => {
  const a = new Rng(42), b = new Rng(42);
  for (let i = 0; i < 1000; i++) expect(a.next()).toBe(b.next());
});

test("different seeds differ", () => {
  const a = new Rng(1), b = new Rng(2);
  const xs = Array.from({ length: 20 }, () => a.next());
  const ys = Array.from({ length: 20 }, () => b.next());
  expect(xs).not.toEqual(ys);
});

test("setState(getState()) continues identically", () => {
  const a = new Rng(7);
  for (let i = 0; i < 50; i++) a.next();
  const saved = a.getState();
  const expected = Array.from({ length: 100 }, () => a.next());
  const b = new Rng(0);
  b.setState(saved);
  expect(Array.from({ length: 100 }, () => b.next())).toEqual(expected);
});

test("int stays in [lo, hi) and rejects bad ranges", () => {
  const r = new Rng(3);
  for (let i = 0; i < 1000; i++) {
    const v = r.int(5, 9);
    expect(v >= 5 && v < 9).toBe(true);
  }
  expect(() => r.int(3, 3)).toThrow();
});
