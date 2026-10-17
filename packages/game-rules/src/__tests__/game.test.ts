import { expect, test } from "vitest";
import { energyUnits, replayMatch, type Action, type Role } from "../index";
import { leader, makeSession } from "./helpers";

const units = (s: ReturnType<typeof makeSession>, r: Role) => energyUnits(s.game.players[r], s.game.cfg, s.now);

test("energy starts at 6, is spent by actions, regenerates 1/s, and caps at 10", () => {
  const s = makeSession();
  expect(units(s, "chaos")).toBe(6);
  s.advance(1000);
  expect(s.act("chaos", { type: "killLeader" })).toEqual({ ok: true, cost: 3 });
  expect(units(s, "chaos")).toBe(4); // 7 after 1s of regen, minus 3
  s.advance(3000);
  expect(units(s, "chaos")).toBe(6);
  s.advance(20000);
  expect(units(s, "chaos")).toBe(10);
});

test("roles are enforced and energy is checked", () => {
  const s = makeSession();
  expect(s.act("chaos", { type: "reviveAll" })).toEqual({ ok: false, reason: "chaos cannot use reviveAll" });
  expect(s.act("defender", { type: "killLeader" })).toEqual({ ok: false, reason: "defender cannot use killLeader" });
  expect(s.act("chaos", { type: "partition", pct: 40 })).toEqual({ ok: true, cost: 6 });
  expect(s.act("chaos", { type: "killLeader" })).toEqual({ ok: false, reason: "not enough energy" });
});

test("invalid targets and states are rejected without spending energy", () => {
  const s = makeSession();
  const reason = (r: Role, a: Action) => { const x = s.act(r, a); return x.ok ? "ok" : x.reason; };
  expect(reason("chaos", { type: "partition", pct: 5 })).toMatch(/pct/);
  expect(reason("chaos", { type: "killValidator", v: 99 })).toBe("invalid validator");
  expect(reason("defender", { type: "revive", v: 3 })).toBe("v3 is already up");
  expect(reason("defender", { type: "reviveAll" })).toBe("nobody is down");
  expect(reason("defender", { type: "healPartition" })).toBe("no partition is active");
  expect(units(s, "chaos")).toBe(6);
  expect(units(s, "defender")).toBe(6);

  expect(s.act("chaos", { type: "killValidator", v: 5 }).ok).toBe(true);
  s.advance(100);
  expect(reason("chaos", { type: "killValidator", v: 5 })).toBe("v5 is already down");
  expect(s.act("chaos", { type: "partition", pct: 10 }).ok).toBe(true);
  s.advance(200);
  expect(reason("chaos", { type: "partition", pct: 10 })).toBe("a partition is already active");
});

test("killing the leader skips its slots and scores for chaos", () => {
  const s = makeSession();
  s.advance(1000);
  const l = leader(s, 3);
  expect(s.act("chaos", { type: "killLeader" }).ok).toBe(true);
  s.advance(2500);
  expect(s.engine.state.net.validators[l]!.up).toBe(false);
  expect(s.game.players.chaos.score).toBeGreaterThan(0);
  expect(s.game.over).toBe(undefined);
});

test("a long stall ends the match: chaos wins; no actions after that", () => {
  const s = makeSession();
  s.advance(1000);
  expect(s.act("chaos", { type: "partition", pct: 40 }).ok).toBe(true);
  s.advance(8000);
  expect(s.game.over?.winner).toBe("chaos");
  expect(s.game.over?.reason).toMatch(/stalled/);
  expect(s.game.longestStallMs >= 4000).toBe(true);
  const endedAt = s.now;
  s.advance(20000);
  expect(s.now).toBe(endedAt);
  expect(s.act("defender", { type: "healPartition" })).toEqual({ ok: false, reason: "match is over" });
});

test("a timely heal ends the stall and the defender comes out ahead", () => {
  const s = makeSession();
  s.advance(1000);
  s.act("chaos", { type: "partition", pct: 40 });
  s.advance(2500);
  expect(s.act("defender", { type: "healPartition" }).ok).toBe(true);
  s.advance(8000);
  expect(s.game.over).toBe(undefined);
  expect(s.game.stallMs).toBe(0);
  expect(s.game.players.defender.score).toBeGreaterThan(s.game.players.chaos.score);
  expect(s.game.feed.some((f) => f.text.startsWith("finality recovered"))).toBe(true);
});

test("a tx that lands scores once for the defender", () => {
  const s = makeSession();
  s.advance(1000);
  expect(s.act("defender", { type: "sendTx" })).toEqual({ ok: true, cost: 0 });
  s.advance(4000);
  expect(s.game.txs[0]!.outcome).toMatchObject({ status: "landed", includedSlot: 3 });
  expect(s.game.txs[0]!.scored).toBe(true);
  s.advance(8000);
  expect(s.game.feed.filter((f) => f.text.includes("landed")).length).toBe(1);
});

test("a tx sent into a dead leader's window is lost and scores for chaos", () => {
  const s = makeSession();
  const dead = leader(s, 4);
  s.advance(1000);
  expect(s.act("chaos", { type: "killValidator", v: dead }).ok).toBe(true);
  s.advance(1500);
  s.act("defender", { type: "sendTx" });
  s.advance(5000);
  expect(s.game.txs[0]!.outcome).toMatchObject({ status: "dropped" });
  expect(s.game.feed.filter((f) => f.text.includes("lost (dropped)")).length).toBe(1);
});

test("in-flight transactions are capped", () => {
  const s = makeSession();
  for (let i = 0; i < 3; i++) expect(s.act("defender", { type: "sendTx" }).ok).toBe(true);
  expect(s.act("defender", { type: "sendTx" })).toEqual({ ok: false, reason: "too many transactions in flight" });
});

test("an idle match ends at the time limit and the defender wins ties and leads", () => {
  const s = makeSession({ durationMs: 10_000 });
  s.advance(60_000);
  expect(s.now).toBe(10_000);
  expect(s.game.over).toMatchObject({ winner: "defender", at: 10_000 });
});

test("a match replays exactly from its action log, and from a snapshot", () => {
  const live = makeSession();
  live.advance(1000);
  live.act("chaos", { type: "killLeader" });
  live.advance(1500);
  live.act("defender", { type: "sendTx" });
  live.advance(3000);
  live.act("chaos", { type: "partition", pct: 20 });
  live.advance(3500);
  live.act("defender", { type: "healPartition" });
  live.advance(12000);

  const again = replayMatch(() => makeSession(), live.game.actions, 12000);
  expect(again.game).toEqual(live.game);
  expect(again.engine.state).toEqual(live.engine.state);

  const s = makeSession();
  s.advance(1000);
  s.act("chaos", { type: "killLeader" });
  s.advance(3000);
  const snap = s.snapshot();
  s.advance(9000);
  const expected = structuredClone(s.game);
  s.restore(snap);
  s.advance(9000);
  expect(s.game).toEqual(expected);
});
