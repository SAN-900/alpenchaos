import { expect, test } from "vitest";
import { Engine } from "../engine";

test("time advances to the target and events run in order", () => {
  const seen: string[] = [];
  const e = new Engine({}, (_s, ev) => void seen.push(`${ev.time}:${ev.kind}`), 1);
  e.schedule(30, "v", "c");
  e.schedule(10, "v", "a");
  e.schedule(10, "v", "b");
  e.runUntil(20);
  expect(seen).toEqual(["10:a", "10:b"]);
  expect(e.now).toBe(20);
  e.runUntil(100);
  expect(seen).toEqual(["10:a", "10:b", "30:c"]);
  expect(e.now).toBe(100);
});

test("handlers can schedule follow-ups, including delay 0", () => {
  const seen: number[] = [];
  const e = new Engine({}, (_s, ev, ctx) => {
    seen.push(ctx.now);
    if (ev.kind === "start") ctx.schedule(0, "v", "same-time");
  }, 1);
  e.schedule(5, "v", "start");
  e.runUntil(5);
  expect(seen).toEqual([5, 5]);
});

test("invalid delays throw", () => {
  const e = new Engine({}, () => {}, 1);
  expect(() => e.schedule(-1, "v", "x")).toThrow();
  expect(() => e.schedule(0.5, "v", "x")).toThrow();
});

test("maxEvents cap leaves remaining events queued and does not jump time", () => {
  let n = 0;
  const e = new Engine({}, () => void n++, 1);
  for (let i = 0; i < 10; i++) e.schedule(i, "v", "x");
  const r = e.runUntil(100, 4);
  expect(r.reachedTarget).toBe(false);
  expect(n).toBe(4);
  expect(e.now).toBe(3);
  const r2 = e.runUntil(100);
  expect(r2.reachedTarget).toBe(true);
  expect(n).toBe(10);
  expect(e.now).toBe(100);
});
