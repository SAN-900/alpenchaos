import { expect, test } from "vitest";
import { Heap } from "../heap";
import { EventQueue } from "../queue";
import { Rng } from "../rng";

test("random numbers pop in sorted order", () => {
  const rng = new Rng(11);
  const h = new Heap<number>((a, b) => a < b);
  const xs = Array.from({ length: 1000 }, () => rng.int(0, 100000));
  xs.forEach((x) => h.push(x));
  const out: number[] = [];
  while (h.size) out.push(h.pop()!);
  expect(out).toEqual([...xs].sort((a, b) => a - b));
});

test("interleaved push and pop keeps order", () => {
  const rng = new Rng(5);
  const h = new Heap<number>((a, b) => a < b);
  let model: number[] = [];
  for (let i = 0; i < 2000; i++) {
    if (rng.next() < 0.6 || model.length === 0) {
      const x = rng.int(0, 500);
      h.push(x);
      model.push(x);
      model.sort((a, b) => a - b);
    } else {
      expect(h.pop()).toBe(model.shift()!);
    }
  }
});

test("empty heap returns undefined", () => {
  const h = new Heap<number>((a, b) => a < b);
  expect(h.pop()).toBe(undefined);
  expect(h.peek()).toBe(undefined);
});

test("events with identical time pop in scheduling (seq) order", () => {
  const q = new EventQueue();
  for (let i = 0; i < 500; i++) q.schedule(10, "v", "e", { i });
  for (let i = 0; i < 500; i++) expect((q.pop()!.payload as { i: number }).i).toBe(i);
});

test("queue pops (time, seq) order for random times with duplicates", () => {
  const rng = new Rng(9);
  const q = new EventQueue();
  for (let i = 0; i < 1000; i++) q.schedule(rng.int(0, 20), "v", "e", { i });
  let prev: { time: number; seq: number } | undefined;
  while (q.size) {
    const ev = q.pop()!;
    if (prev) expect(ev.time > prev.time || (ev.time === prev.time && ev.seq > prev.seq)).toBe(true);
    prev = ev;
  }
});

test("queue rejects bad times", () => {
  const q = new EventQueue();
  expect(() => q.schedule(1.5, "v", "e")).toThrow();
  expect(() => q.schedule(-1, "v", "e")).toThrow();
});
