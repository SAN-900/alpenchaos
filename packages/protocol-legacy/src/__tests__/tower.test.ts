import { expect, test } from "vitest";
import { isAncestor, tryVote } from "../tower";
import type { TbValidator } from "../types";

const validator = (blocks: Record<string, number>): TbValidator => ({
  blocks,
  tower: [],
  root: -1,
  lastVote: -1,
  voters: {},
  rootVoters: {},
});
const chain = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, s) => [String(s), s - 1]));

test("isAncestor follows parent pointers", () => {
  const b = { "0": -1, "1": 0, "2": 0, "3": 1 };
  expect(isAncestor(b, 0, 3)).toBe(true);
  expect(isAncestor(b, 1, 3)).toBe(true);
  expect(isAncestor(b, 2, 3)).toBe(false); // 2 is a fork of 1
  expect(isAncestor(b, 3, 3)).toBe(true);
});

test("consecutive votes root the bottom entry once the tower exceeds 31", () => {
  const pv = validator(chain(40));
  for (let s = 0; s <= 30; s++) expect(tryVote(pv, s, 31)).toBe(true);
  expect(pv.root).toBe(-1);
  expect(pv.tower.length).toBe(31);
  expect(tryVote(pv, 31, 31)).toBe(true);
  expect(pv.root).toBe(0);
  expect(pv.tower.length).toBe(31);
  expect(pv.tower[0]!.slot).toBe(1);
});

test("a gap in slots expires lockouts and shrinks the tower", () => {
  const blocks = { ...chain(3), "10": 2 };
  const pv = validator(blocks);
  for (const s of [0, 1, 2]) tryVote(pv, s, 31);
  expect(pv.tower.map((e) => e.conf)).toEqual([3, 2, 1]);
  expect(tryVote(pv, 10, 31)).toBe(true);
  expect(pv.tower).toEqual([{ slot: 10, conf: 1 }]);
});

test("locked out of a fork until the lockout expires", () => {
  const blocks = { "0": -1, "1": 0, "2": 0, "4": 0 };
  const pv = validator(blocks);
  expect(tryVote(pv, 1, 31)).toBe(true);
  expect(tryVote(pv, 2, 31)).toBe(false); // fork of 1, lockout runs to slot 3
  expect(pv.tower).toEqual([{ slot: 1, conf: 1 }]); // unchanged
  expect(tryVote(pv, 4, 31)).toBe(true); // lockout expired
  expect(pv.tower).toEqual([{ slot: 4, conf: 1 }]);
});

test("votes must move forward", () => {
  const pv = validator(chain(5));
  expect(tryVote(pv, 3, 31)).toBe(true);
  expect(tryVote(pv, 3, 31)).toBe(false);
  expect(tryVote(pv, 2, 31)).toBe(false);
});
