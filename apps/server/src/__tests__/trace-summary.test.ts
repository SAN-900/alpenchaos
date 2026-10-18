import { expect, test } from "vitest";
import type { TraceEntry } from "@alpenchaos/shared";
import { TraceAccumulator, summarizeTrace } from "../services/trace-summary";

const send = (time: number, n: number): TraceEntry => ({ time, kind: "net:send", from: n, to: 0 });
const ev = (time: number, kind: string): TraceEntry => ({ time, kind });

function mixed(): TraceEntry[] {
  const out: TraceEntry[] = [];
  for (let i = 0; i < 2000; i++) out.push(send(i, i));
  out.push(ev(5, "ag:block"), ev(300, "fault:kill"), ev(900, "ag:skipped"), ev(1500, "ag:finalized"), ev(1999, "tb:finalized"));
  return out;
}

test("meaningful events always make the sample; sends only fill the leftover room", () => {
  const s = summarizeTrace(mixed());
  const kinds = s.sample.map((e) => e.kind);
  for (const k of ["ag:block", "fault:kill", "ag:skipped", "ag:finalized", "tb:finalized"]) expect(kinds.includes(k)).toBe(true);
  expect(s.sample.length).toBe(50);
  expect(s.totalEvents).toBe(2005);
  expect(s.byKind["net:send"]).toBe(2000);
  expect(s.truncated).toBe(true);
});

test("the sample is ordered by time and spread across the whole run", () => {
  const s = summarizeTrace(mixed());
  const times = s.sample.map((e) => e.time);
  expect([...times].sort((a, b) => a - b)).toEqual(times);
  expect(times[times.length - 1]! > 1500).toBe(true);
  expect(times.filter((t) => t < 500).length < 25).toBe(true);
});

test("feeding slices gives the same summary as one shot (long advances can stream)", () => {
  const all = mixed();
  const acc = new TraceAccumulator();
  for (let i = 0; i < all.length; i += 300) acc.add(all.slice(i, i + 300));
  expect(acc.finish()).toEqual(summarizeTrace(all));
});

test("small traces are returned whole; limits are respected", () => {
  const few = [ev(1, "ag:block"), send(2, 1), ev(3, "ag:finalized")];
  const s = summarizeTrace(few);
  expect(s.sample).toEqual(few);
  expect(s.truncated).toBe(false);
  expect(summarizeTrace(mixed(), 10).sample.length <= 10).toBe(true);
});

test("deterministic", () => {
  expect(summarizeTrace(mixed())).toEqual(summarizeTrace(mixed()));
});
