import { expect, test } from "vitest";
import { MemoryStore, SqliteStore, type MatchRecord, type Store } from "../realtime/store";

const rec = (id: string, over: Partial<MatchRecord> = {}): MatchRecord => ({
  id, scenarioId: "daily-2026-10-17", roomId: "r1", winner: "chaos", reason: "finality stalled for 4.0s", simMs: 9000, createdAt: 1000,
  longestStallMs: 4000, objectiveMet: true,
  actions: [{ t: 1000, role: "chaos", action: { type: "partition", pct: 40 } }],
  players: [{ role: "chaos", name: "Ana", score: 50 }, { role: "defender", name: "Bo", score: 12 }],
  ...over,
});

function contract(make: () => Store) {
  const s = make();
  s.saveMatch(rec("m1"));
  s.saveMatch(rec("m2", { createdAt: 2000, players: [{ role: "chaos", name: "Cy", score: 80 }, { role: "defender", name: "Di", score: 5 }], objectiveMet: null }));
  s.saveMatch(rec("m3", { createdAt: 3000, players: [{ role: "chaos", name: "Ed", score: 50 }] }));
  s.saveMatch(rec("m4", { scenarioId: "baseline", createdAt: 4000, players: [{ role: "chaos", name: "Zed", score: 999 }] }));

  const m1 = s.getMatch("m1")!;
  expect(s.recent(2).map((m) => m.id)).toEqual(["m4", "m3"]);
  expect(s.recent(1)[0]).toMatchObject({
    id: "m4",
    scenarioId: "baseline",
    players: [{ role: "chaos", name: "Zed", score: 999 }],
  });
  expect(m1.actions).toEqual([{ t: 1000, role: "chaos", action: { type: "partition", pct: 40 } }]);
  expect(m1.players.map((p) => [p.role, p.name, p.score]).sort()).toEqual([["chaos", "Ana", 50], ["defender", "Bo", 12]]);
  expect(m1.objectiveMet).toBe(true);
  expect(s.getMatch("m2")!.objectiveMet).toBe(null);
  expect(s.getMatch("nope")).toBe(undefined);

  // best score first; ties go to whoever got there first; scenarios are separate
  expect(s.top("daily-2026-10-17", "chaos", 10).map((r) => r.name)).toEqual(["Cy", "Ana", "Ed"]);
  expect(s.top("daily-2026-10-17", "defender", 10).map((r) => r.name)).toEqual(["Bo", "Di"]);
  expect(s.top("daily-2026-10-17", "chaos", 2).length).toBe(2);
  expect(s.top("baseline", "chaos", 10).map((r) => r.name)).toEqual(["Zed"]);
  expect(s.top("unknown", "chaos", 10)).toEqual([]);
  expect(s.top("daily-2026-10-17", "chaos", 10)[0]).toEqual({ name: "Cy", score: 80, matchId: "m2", createdAt: 2000 });
}

test("MemoryStore satisfies the store contract", () => contract(() => new MemoryStore()));

test("SqliteStore satisfies the same contract (node:sqlite here, bun:sqlite in production)", async () => {
  let DatabaseSync: any;
  try {
    ({ DatabaseSync } = await import("node:sqlite"));
  } catch {
    console.warn("node:sqlite unavailable on this Node version; skipping");
    return;
  }
  contract(() => new SqliteStore(new DatabaseSync(":memory:")));
});

test("SqliteStore: a failed save rolls back completely and rejects duplicate ids", async () => {
  let DatabaseSync: any;
  try {
    ({ DatabaseSync } = await import("node:sqlite"));
  } catch {
    return;
  }
  const s = new SqliteStore(new DatabaseSync(":memory:"));
  s.saveMatch(rec("dup"));
  expect(() => s.saveMatch(rec("dup", { players: [{ role: "chaos", name: "Late", score: 1 }] }))).toThrow();
  expect(s.top("daily-2026-10-17", "chaos", 10).map((r) => r.name)).toEqual(["Ana"]); // no half-written rows
});
