import { expect, test } from "vitest";
import { makeSession } from "./helpers";

const net = (s: ReturnType<typeof makeSession>) => s.engine.state.net;
const reason = (r: { ok: boolean; reason?: string }) => (r.ok ? "ok" : r.reason);

test("a second packet-loss burst is refused while one is running, so effects never end early", () => {
  const s = makeSession();
  s.advance(1000);
  expect(s.act("chaos", { type: "lossBurst" }).ok).toBe(true);
  expect(reason(s.act("chaos", { type: "lossBurst" }))).toBe("packet loss is already active"); // same step: still refused
  s.advance(2000);
  expect(reason(s.act("chaos", { type: "lossBurst" }))).toBe("packet loss is already active");
  s.advance(4100); // the burst ends at 4.0s
  expect(net(s).lossRate).toBe(0);
  s.advance(5000);
  expect(s.act("chaos", { type: "lossBurst" }).ok).toBe(true); // allowed again afterwards
  s.advance(5200);
  expect(net(s).lossRate > 0).toBe(true);
});

test("slowing the same validator twice is refused; a different validator is fine", () => {
  const s = makeSession();
  s.advance(1000);
  expect(s.act("chaos", { type: "slowValidator", v: 2 }).ok).toBe(true);
  expect(reason(s.act("chaos", { type: "slowValidator", v: 2 }))).toBe("v2 is already slowed");
  expect(s.act("chaos", { type: "slowValidator", v: 3 }).ok).toBe(true);
  s.advance(6200); // slow lasts 5s
  expect(net(s).extraDelay[2]).toBe(0);
  s.advance(6300);
  expect(s.act("chaos", { type: "slowValidator", v: 2 }).ok).toBe(true);
});

test("after the defender heals early, a new partition waits for the old one's scheduled end", () => {
  const s = makeSession();
  s.advance(1000);
  expect(s.act("chaos", { type: "partition", pct: 20 }).ok).toBe(true);   // would auto-heal at 11s
  s.advance(2000);
  expect(s.act("defender", { type: "healPartition" }).ok).toBe(true);
  s.advance(4000);
  const early = s.act("chaos", { type: "partition", pct: 20 });
  expect(early.ok).toBe(false);
  expect((early as { reason: string }).reason).toMatch(/cooldown for 7s/);   // scheduled end 11s - now 4s = 7s
  s.advance(11000);
  expect(s.act("chaos", { type: "partition", pct: 20 }).ok).toBe(true);
  s.advance(15000);
  expect(net(s).group.some((g) => g !== 0)).toBe(true);   // 10s partition, not cut short by an old heal event
});

test("the guards are part of game state: a replay reproduces the same accepted and refused actions", async () => {
  const { replayMatch } = await import("../index");
  const live = makeSession();
  live.advance(1000); live.act("chaos", { type: "lossBurst" });
  live.advance(1500); live.act("chaos", { type: "lossBurst" });          // refused, so not logged
  live.advance(4500); live.act("chaos", { type: "lossBurst" });
  live.advance(9000);
  expect(live.game.actions.filter((a) => a.action.type === "lossBurst").length).toBe(2);
  const again = replayMatch(() => makeSession(), live.game.actions, 9000);
  expect(again.game).toEqual(live.game);
});
