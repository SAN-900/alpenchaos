import { expect, test } from "vitest";
import { SCENARIOS, dailyScenario, getScenario, validateScenario } from "../index";

const base = () => structuredClone(getScenario("baseline")!) as any;
const errs = (mutate: (s: any) => void) => { const s = base(); mutate(s); return validateScenario(s); };
const mentions = (e: string[], text: string) => e.some((m) => m.includes(text));

test("every preset and 60 days of daily scenarios still validate", () => {
  for (const s of SCENARIOS) expect(validateScenario(s)).toEqual([]);
  for (let d = 1; d <= 60; d++) {
    const key = `2026-${String(1 + Math.floor((d - 1) / 28)).padStart(2, "0")}-${String(1 + ((d - 1) % 28)).padStart(2, "0")}`;
    expect(validateScenario(dailyScenario(key))).toEqual([]);
  }
});

test("game overrides are bounded: no 1ms steps, no negative or unknown options", () => {
  expect(mentions(errs((s) => (s.game = { stepMs: 1 })), "game.stepMs")).toBe(true);
  expect(mentions(errs((s) => (s.game = { slotMs: -400 })), "game.slotMs")).toBe(true);
  expect(mentions(errs((s) => (s.game = { durationMs: 10 ** 9 })), "game.durationMs")).toBe(true);
  expect(mentions(errs((s) => (s.game = { evil: 1 })), "not a known option")).toBe(true);
  expect(mentions(errs((s) => (s.game = { costs: { killLeader: -5 } })), "game.costs.killLeader")).toBe(true);
  expect(mentions(errs((s) => (s.game = { pts: { skip: Infinity } })), "game.pts.skip")).toBe(true);
  expect(errs((s) => (s.game = { stepMs: 100, breakStallMs: 5000, costs: { killLeader: 2 } }))).toEqual([]);
});

test("network, protocol and txConfig options are bounded", () => {
  expect(mentions(errs((s) => (s.network = { validators: 24, regions: 0 })), "network.regions")).toBe(true);
  expect(mentions(errs((s) => (s.network = { validators: 24, zipfS: 99 })), "network.zipfS")).toBe(true);
  expect(mentions(errs((s) => (s.network = { validators: 24, leaderWindows: 10 ** 9 })), "network.leaderWindows")).toBe(true);
  expect(mentions(errs((s) => (s.network = { validators: 24, traceSends: "yes" })), "network.traceSends")).toBe(true);
  expect(mentions(errs((s) => (s.protocol = { ag: { slotMs: 0 } })), "protocol.ag.slotMs")).toBe(true);
  expect(mentions(errs((s) => (s.protocol = { xx: {} })), "protocol.xx")).toBe(true);
  expect(mentions(errs((s) => (s.txConfig = { maxAgeSlots: 10 ** 9 })), "txConfig.maxAgeSlots")).toBe(true);
  expect(errs((s) => { s.network = { validators: 24, regions: 5, traceSends: false }; s.protocol = { ag: { timeoutMs: 600 } }; s.txConfig = { maxAgeSlots: 20 }; })).toEqual([]);
});

test("sizes and tx details are capped", () => {
  expect(mentions(errs((s) => (s.faults = Array.from({ length: 101 }, () => ({ type: "heal", at: 1 })))), "faults must have at most 100")).toBe(true);
  expect(mentions(errs((s) => (s.txs = Array.from({ length: 101 }, (_, i) => ({ id: `t${i}`, sentAt: 1 })))), "txs must have at most 100")).toBe(true);
  expect(mentions(errs((s) => (s.id = "a".repeat(65))), "id must be at most 64")).toBe(true);
  expect(mentions(errs((s) => (s.txs = [{ id: "t", sentAt: 1, uplinkMs: -1 }])), "uplinkMs")).toBe(true);
  expect(mentions(errs((s) => (s.txs = [{ id: "t", sentAt: 1, recentSlot: 1.5 }])), "recentSlot")).toBe(true);
});
