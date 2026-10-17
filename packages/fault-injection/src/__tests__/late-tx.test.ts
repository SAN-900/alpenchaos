import { expect, test } from "vitest";
import { leaderForSlot } from "@alpenchaos/network-simulator";
import { analyzeTx, injectFaults, killLeader, type BlockRecord } from "../index";
import { agBlocks, agResult, build, start, tbBlocks, tbResult } from "./helpers";

const blk = (slot: number): BlockRecord => ({ slot, leader: 0, time: slot * 400 });
const never = () => undefined;

test("blockhash expiry boundary: valid through recent+150, expired after", () => {
  const blocks = [blk(150), blk(151)];
  const ok = analyzeTx({ id: "a", sentAt: 150 * 400, recentSlot: 0, uplinkMs: 0 }, blocks, never, 1e6);
  expect(ok.status).toBe("pending");
  const late = analyzeTx({ id: "b", sentAt: 151 * 400, recentSlot: 0, uplinkMs: 0 }, blocks, never, 1e6);
  expect(late).toEqual({ status: "expired", reason: "blockhash expired before the tx reached a leader" });
});

test("expires if the only reachable block is past the blockhash lifetime", () => {
  const o = analyzeTx({ id: "c", sentAt: 150 * 400 - 100, recentSlot: 0, uplinkMs: 0 }, [blk(151)], never, 1e6);
  expect(o.status).toBe("expired");
});

test("a tx that arrives after a block is built goes into the next block", () => {
  const blocks = [blk(3), blk(4)];
  const inTime = analyzeTx({ id: "d", sentAt: 1170, uplinkMs: 20 }, blocks, never, 5000);
  const tooLate = analyzeTx({ id: "e", sentAt: 1199, uplinkMs: 20 }, blocks, never, 5000);
  expect(inTime).toEqual({ status: "pending", includedSlot: 3 });
  expect(tooLate).toEqual({ status: "pending", includedSlot: 4 });
});

test("pending before any block; dropped once the forward window has passed", () => {
  const tx = { id: "f", sentAt: 1500, uplinkMs: 20 };
  expect(analyzeTx(tx, [], never, 1550)).toEqual({ status: "pending" });
  expect(analyzeTx(tx, [], never, 1520 + 4 * 400)).toEqual({ status: "dropped", reason: "no leader produced a block within the forward window" });
});

test("finalized vs skipped slots give landed vs abandoned (with retryable)", () => {
  const blocks = [blk(3)];
  const landed = analyzeTx({ id: "g", sentAt: 1000 }, blocks, () => ({ status: "finalized", at: 1405 }), 5000);
  expect(landed).toEqual({ status: "landed", includedSlot: 3, confirmedAt: 1405, latencyMs: 405 });
  const lost = analyzeTx({ id: "h", sentAt: 1000 }, blocks, () => ({ status: "skipped", at: 1700 }), 5000);
  expect(lost).toEqual({ status: "abandoned", includedSlot: 3, decidedAt: 1700, retryable: true });
  const tooSlow = analyzeTx({ id: "i", sentAt: 1000 }, blocks, () => ({ status: "skipped", at: 80_000 }), 90_000);
  expect(tooSlow).toMatchObject({ status: "abandoned", retryable: false });
});

test("healthy network: the same tx lands ~0.4s on Alpenglow and ~12.7s on legacy", () => {
  const e = build();
  start(e);
  e.runUntil(20000);
  const tx = { id: "t1", sentAt: 1000 };
  const a = analyzeTx(tx, agBlocks(e), agResult(e), e.now);
  const l = analyzeTx(tx, tbBlocks(e), tbResult(e), e.now);
  expect(a).toMatchObject({ status: "landed", includedSlot: 3 });
  expect(l).toMatchObject({ status: "landed", includedSlot: 3 });
  if (a.status === "landed" && l.status === "landed") {
    expect(a.latencyMs).toBeLessThan(800);
    expect(l.latencyMs).toBeGreaterThan(11000);
  }
});

test("dead leader: a tx sent into its window is dropped with default forwarding, lands if forwarded further", () => {
  const e = build();
  injectFaults(e, killLeader(e.state.net, 4));
  start(e);
  e.runUntil(8000);
  const tx = { id: "t2", sentAt: 1500 }; // arrives 1520, leader of slots 4-7 is dead
  // default forwardSlots = 4 reaches only to ~3120ms, but the next leader builds at 3200ms
  expect(analyzeTx(tx, agBlocks(e), agResult(e), e.now)).toMatchObject({ status: "dropped" });
  expect(analyzeTx(tx, agBlocks(e), agResult(e), e.now, { forwardSlots: 8 })).toMatchObject({ status: "landed", includedSlot: 8 });
});

test("abandoned bank: block built by an isolated leader, slot skipped, tx lost on both protocols", () => {
  const e = build();
  const { net } = e.state;
  const l = leaderForSlot(net, 4);
  // cut the leader off from everyone else, so its blocks never reach the majority
  e.schedule(0, "world", "net:partition", { groups: [[l]] });
  start(e);
  e.runUntil(25000);
  const tx = { id: "t3", sentAt: 1500 }; // reaches the isolated leader before its slot-4 block
  const a = analyzeTx(tx, agBlocks(e), agResult(e), e.now);
  const t = analyzeTx(tx, tbBlocks(e), tbResult(e), e.now);
  expect(a).toMatchObject({ status: "abandoned", includedSlot: 4, retryable: true });
  expect(t).toMatchObject({ status: "abandoned", includedSlot: 4, retryable: true });
  if (a.status === "abandoned" && t.status === "abandoned") {
    expect(a.decidedAt).toBeLessThan(3000);   // Alpenglow knows within about a second
    expect(t.decidedAt).toBeGreaterThan(12000); // legacy only learns ~13s later
  }
});

