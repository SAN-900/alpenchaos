import { expect, test } from "vitest";
import { makeStakes, meetsThreshold } from "../stake";

test("stakes are positive integers that sum exactly to the total, descending", () => {
  const s = makeStakes(24, 0.8, 1_000_000);
  expect(s.reduce((a, b) => a + b, 0)).toBe(1_000_000);
  expect(s.every((x) => Number.isInteger(x) && x >= 1)).toBe(true);
  for (let i = 1; i < s.length; i++) expect(s[i]! <= s[i - 1]!).toBe(true);
});

test("zipfS = 0 gives near-equal stake", () => {
  const s = makeStakes(10, 0, 1_000_000);
  expect(Math.max(...s) - Math.min(...s) < 20).toBe(true);
});

test("meetsThreshold is exact at the boundary", () => {
  expect(meetsThreshold(800_000, 1_000_000, 80, 100)).toBe(true);
  expect(meetsThreshold(799_999, 1_000_000, 80, 100)).toBe(false);
  expect(meetsThreshold(600_000, 1_000_000, 60, 100)).toBe(true);
});
