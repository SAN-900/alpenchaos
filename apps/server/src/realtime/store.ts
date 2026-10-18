import type { LoggedAction, Role } from "@alpenchaos/game-rules";

export type MatchPlayer = { role: Role; name: string; score: number };

export type MatchRecord = {
  id: string;
  scenarioId: string;
  roomId: string;
  winner: Role;
  reason: string;
  /** Simulated ms the match lasted. */
  simMs: number;
  /** Wall-clock ms when it ended. */
  createdAt: number;
  longestStallMs: number;
  objectiveMet: boolean | null;
  /** Everything needed to re-simulate: scenario id + this action log. */
  actions: LoggedAction[];
  players: MatchPlayer[];
};

export type ScoreRow = { name: string; score: number; matchId: string; createdAt: number };

export interface Store {
  saveMatch(m: MatchRecord): void;
  getMatch(id: string): MatchRecord | undefined;
  top(scenarioId: string, role: Role, limit: number): ScoreRow[];
}

const clampLimit = (n: number) => Math.max(1, Math.min(100, Math.floor(n)));

export class MemoryStore implements Store {
  private matches = new Map<string, MatchRecord>();
  saveMatch(m: MatchRecord): void {
    this.matches.set(m.id, structuredClone(m));
  }
  getMatch(id: string): MatchRecord | undefined {
    const m = this.matches.get(id);
    return m && structuredClone(m);
  }
  top(scenarioId: string, role: Role, limit: number): ScoreRow[] {
    const rows: ScoreRow[] = [];
    for (const m of this.matches.values()) {
      if (m.scenarioId !== scenarioId) continue;
      for (const p of m.players) if (p.role === role) rows.push({ name: p.name, score: p.score, matchId: m.id, createdAt: m.createdAt });
    }
    rows.sort((a, b) => b.score - a.score || a.createdAt - b.createdAt);
    return rows.slice(0, clampLimit(limit));
  }
}

/** The small slice of a SQLite driver we use. bun:sqlite and node:sqlite both satisfy it. */
export interface SqlStatement {
  run(...params: unknown[]): unknown;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}
export interface SqlDb {
  exec(sql: string): void;
  prepare(sql: string): SqlStatement;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  scenario_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  winner TEXT NOT NULL,
  reason TEXT NOT NULL,
  sim_ms INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  longest_stall_ms INTEGER NOT NULL,
  objective_met INTEGER,
  actions TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS results (
  match_id TEXT NOT NULL REFERENCES matches(id),
  scenario_id TEXT NOT NULL,
  role TEXT NOT NULL,
  name TEXT NOT NULL,
  score INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS results_top ON results (scenario_id, role, score DESC, created_at);
`;

type MatchRow = {
  id: string; scenario_id: string; room_id: string; winner: Role; reason: string; sim_ms: number;
  created_at: number; longest_stall_ms: number; objective_met: number | null; actions: string;
};

export class SqliteStore implements Store {
  constructor(private db: SqlDb) {
    db.exec(SCHEMA);
  }

  saveMatch(m: MatchRecord): void {
    const { db } = this;
    db.exec("BEGIN");
    try {
      db.prepare(
        `INSERT INTO matches (id, scenario_id, room_id, winner, reason, sim_ms, created_at, longest_stall_ms, objective_met, actions)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        m.id, m.scenarioId, m.roomId, m.winner, m.reason, m.simMs, m.createdAt, m.longestStallMs,
        m.objectiveMet === null ? null : m.objectiveMet ? 1 : 0, JSON.stringify(m.actions),
      );
      const ins = db.prepare("INSERT INTO results (match_id, scenario_id, role, name, score, created_at) VALUES (?, ?, ?, ?, ?, ?)");
      for (const p of m.players) ins.run(m.id, m.scenarioId, p.role, p.name, p.score, m.createdAt);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }

  getMatch(id: string): MatchRecord | undefined {
    const row = this.db.prepare("SELECT * FROM matches WHERE id = ?").get(id) as MatchRow | undefined;
    if (!row) return undefined;
    const players = this.db
      .prepare("SELECT role, name, score FROM results WHERE match_id = ? ORDER BY role")
      .all(id) as MatchPlayer[];
    return {
      id: row.id,
      scenarioId: row.scenario_id,
      roomId: row.room_id,
      winner: row.winner,
      reason: row.reason,
      simMs: row.sim_ms,
      createdAt: row.created_at,
      longestStallMs: row.longest_stall_ms,
      objectiveMet: row.objective_met === null ? null : row.objective_met === 1,
      actions: JSON.parse(row.actions) as LoggedAction[],
      players: players.map((p) => ({ role: p.role, name: p.name, score: p.score })),
    };
  }

  top(scenarioId: string, role: Role, limit: number): ScoreRow[] {
    const rows = this.db
      .prepare(
        `SELECT name, score, match_id AS matchId, created_at AS createdAt FROM results
         WHERE scenario_id = ? AND role = ? ORDER BY score DESC, created_at ASC LIMIT ?`,
      )
      .all(scenarioId, role, clampLimit(limit)) as ScoreRow[];
    return rows.map((r) => ({ name: r.name, score: r.score, matchId: r.matchId, createdAt: r.createdAt }));
  }
}
