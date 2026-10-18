import { expect, test } from "vitest";
import { parseActionBody, parseAdvanceBody } from "../http/validate";

const ok = (b: unknown) => { const r = parseActionBody(b); if (!r.ok) throw new Error(r.message); return r.value; };
const msg = (b: unknown) => { const r = parseActionBody(b); return r.ok ? "ok" : r.message; };

test("valid actions are normalized to known fields only", () => {
  expect(ok({ role: "chaos", action: { type: "killLeader", junk: 1 } })).toEqual({ role: "chaos", action: { type: "killLeader" } });
  expect(ok({ role: "chaos", action: { type: "partition", pct: 40, evil: true } })).toEqual({ role: "chaos", action: { type: "partition", pct: 40 } });
  expect(ok({ role: "defender", action: { type: "revive", v: 3 } })).toEqual({ role: "defender", action: { type: "revive", v: 3 } });
  expect(ok({ role: "defender", action: { type: "sendTx", id: "tx-1" } })).toEqual({ role: "defender", action: { type: "sendTx", id: "tx-1" } });
  expect(ok({ role: "defender", action: { type: "sendTx" } })).toEqual({ role: "defender", action: { type: "sendTx" } });
});

test("bad shapes are rejected with a message", () => {
  expect(msg(null)).toMatch(/object/);
  expect(msg([])).toMatch(/object/);
  expect(msg({ role: "admin", action: { type: "killLeader" } })).toMatch(/role/);
  expect(msg({ role: "chaos" })).toMatch(/action.type/);
  expect(msg({ role: "chaos", action: { type: "nuke" } })).toMatch(/action.type/);
  expect(msg({ role: "chaos", action: { type: "__proto__" } })).toMatch(/action.type/);
  expect(msg({ role: "chaos", action: { type: "killValidator", v: 1.5 } })).toMatch(/action.v/);
  expect(msg({ role: "chaos", action: { type: "killValidator", v: -1 } })).toMatch(/action.v/);
  expect(msg({ role: "chaos", action: { type: "partition", pct: "40" } })).toMatch(/pct/);
  expect(msg({ role: "defender", action: { type: "sendTx", id: "a b" } })).toMatch(/id/);
  expect(msg({ role: "defender", action: { type: "sendTx", id: "x".repeat(41) } })).toMatch(/id/);
});

test("advance bodies: duration and optional sample limit", () => {
  expect(parseAdvanceBody({ durationMs: 1000 })).toEqual({ ok: true, value: { durationMs: 1000 } });
  expect(parseAdvanceBody({ durationMs: 1000, limit: 200 })).toEqual({ ok: true, value: { durationMs: 1000, limit: 200 } });
  for (const bad of [{}, { durationMs: 0 }, { durationMs: -1 }, { durationMs: 60_001 }, { durationMs: 1.5 }, { durationMs: "5" }, { durationMs: 10, limit: 0 }, { durationMs: 10, limit: 501 }]) {
    expect(parseAdvanceBody(bad).ok).toBe(false);
  }
});
