import { expect, test } from "vitest";
import { isOriginAllowed, getAllowedOrigins } from "../config";
import { MAX_MESSAGE_BYTES, parseClientMessage, sanitizeName } from "../realtime/protocol";
import { TokenBucket } from "../realtime/ratelimit";

const ok = (raw: string) => { const r = parseClientMessage(raw); if (!r.ok) throw new Error(`${r.code}: ${r.message}`); return r.msg; };
const code = (raw: string) => { const r = parseClientMessage(raw); return r.ok ? "ok" : r.code; };

test("valid messages parse to normalized shapes", () => {
  expect(ok('{"t":"ping"}')).toEqual({ t: "ping" });
  expect(ok('{"t":"start","junk":1}')).toEqual({ t: "start" });
  expect(ok('{"t":"join","room":"abc123","role":"chaos","name":"  Ana <b>x</b> ","extra":1}')).toEqual({ t: "join", room: "abc123", role: "chaos", name: "Ana bxb" });
  expect(ok('{"t":"join","room":"abc","token":"tok-1"}')).toEqual({ t: "join", room: "abc", token: "tok-1", name: "player" });
  expect(ok('{"t":"action","action":{"type":"killLeader"}}')).toEqual({ t: "action", action: { type: "killLeader" } });
});

test("bad frames get a code, never throw", () => {
  expect(code("not json")).toBe("BAD_JSON");
  expect(code("[]")).toBe("BAD_MESSAGE");
  expect(code('{"t":5}')).toBe("BAD_MESSAGE");
  expect(code('{"t":"nope"}')).toBe("BAD_MESSAGE");
  expect(code('{"t":"join"}')).toBe("BAD_MESSAGE");
  expect(code('{"t":"join","room":"a b"}')).toBe("BAD_MESSAGE");
  expect(code('{"t":"join","room":"abc","role":"admin"}')).toBe("BAD_MESSAGE");
  expect(code('{"t":"join","room":"abc","token":"../x"}')).toBe("BAD_MESSAGE");
  expect(code('{"t":"action","action":"killLeader"}')).toBe("BAD_MESSAGE");
  expect(code("x".repeat(MAX_MESSAGE_BYTES + 1))).toBe("TOO_LARGE");
});

test("names are sanitized and capped", () => {
  expect(sanitizeName(undefined)).toBe("player");
  expect(sanitizeName("   ")).toBe("player");
  expect(sanitizeName("<script>")).toBe("script");
  expect(sanitizeName("a".repeat(100)).length).toBe(24);
  expect(sanitizeName("Zoë_9.x-y")).toBe("Zoë_9.x-y");
});

test("token bucket allows a burst, then refills with time", () => {
  const b = new TokenBucket(3, 1, 0);
  expect([b.take(0), b.take(0), b.take(0), b.take(0)]).toEqual([true, true, true, false]);
  expect(b.take(500)).toBe(false);
  expect(b.take(1000)).toBe(true);
  expect(b.take(1000)).toBe(false);
  expect(b.take(60_000)).toBe(true); // refill is capped at capacity, not unbounded
  expect([b.take(60_000), b.take(60_000), b.take(60_000)]).toEqual([true, true, false]);
});

test("origin checks: browsers must match, tools without Origin pass", () => {
  const allowed = ["http://localhost:3000", "https://app.example.com"];
  expect(isOriginAllowed("http://localhost:3000", allowed)).toBe(true);
  expect(isOriginAllowed("https://evil.example", allowed)).toBe(false);
  expect(isOriginAllowed(null, allowed)).toBe(true);
  expect(isOriginAllowed("http://localhost:3000/", allowed)).toBe(false);
  expect(getAllowedOrigins({})).toEqual(["http://localhost:3000", "http://127.0.0.1:3000"]);
  expect(getAllowedOrigins({ ALLOWED_ORIGINS: " https://a.com , https://b.com ," })).toEqual([
    "http://localhost:3000", "http://127.0.0.1:3000", "https://a.com", "https://b.com",
  ]);
});
