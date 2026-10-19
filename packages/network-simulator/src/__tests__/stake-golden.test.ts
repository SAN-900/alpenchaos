import { expect, test } from "vitest";
import { makeStakes } from "../stake";

/**
 * Frozen from the original Math.pow-based implementation. If any JavaScript
 * engine (Node, Bun, a browser) computes different stakes for these, replays
 * and leaderboards would silently diverge between server and client, so this
 * must fail loudly.
 */
const GOLDEN: [number, number, number[]][] = [
  [24, 0.8, [198328, 113902, 82349, 65419, 54724, 47297, 41809, 37573, 34195, 31430, 29123, 27165, 25480, 24013, 22724, 21580, 20558, 19639, 18808, 18052, 17361, 16727, 16142, 15602]],
  [16, 0.6, [174832, 115340, 90432, 76096, 66560, 59663, 54392, 50204, 46779, 43913, 41472, 39363, 37517, 35885, 34430, 33122]],
  [32, 1.2, [322664, 140441, 86334, 61130, 46769, 37579, 31232, 26608, 23101, 20357, 18157, 16357, 14859, 13594, 12514, 11582, 10769, 10055, 9423, 8861, 8357, 7903, 7493, 7119, 6779, 6467, 6181, 5917, 5673, 5447, 5237, 5041]],
  [20, 1, [277960, 138976, 92650, 69488, 55590, 46325, 39707, 34744, 30883, 27795, 25268, 23162, 21380, 19853, 18530, 17372, 16350, 15441, 14629, 13897]],
];

test("stake distributions match the frozen golden vectors exactly", () => {
  for (const [n, s, expected] of GOLDEN) expect(makeStakes(n, s, 1_000_000)).toEqual(expected);
});

test("every golden vector still sums to the total and is non-increasing", () => {
  for (const [, , expected] of GOLDEN) {
    expect(expected.reduce((a, b) => a + b, 0)).toBe(1_000_000);
    for (let i = 1; i < expected.length; i++) expect(expected[i]! <= expected[i - 1]!).toBe(true);
  }
});
