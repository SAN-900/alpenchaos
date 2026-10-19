"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Role } from "@alpenchaos/game-rules";
import { apiUrl, readApiError } from "../lib/api";

type ScenarioOption = { id: string; name: string };
type ScoreRow = { name: string; score: number; matchId: string; createdAt: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function Leaderboard({ scenarios }: { scenarios: ScenarioOption[] }) {
  const [scenarioId, setScenarioId] = useState(scenarios[0]?.id ?? "");
  const [role, setRole] = useState<Role>("chaos");
  const [rows, setRows] = useState<ScoreRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!scenarioId) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(apiUrl(`/leaderboard/${encodeURIComponent(scenarioId)}?role=${role}&limit=50`), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readApiError(response));
        const result: unknown = await response.json();
        if (!isRecord(result) || !Array.isArray(result.rows)) throw new Error("The server returned an invalid leaderboard.");
        const validRows = result.rows.filter((row): row is ScoreRow =>
          isRecord(row) && typeof row.name === "string" && typeof row.score === "number" &&
          typeof row.matchId === "string" && typeof row.createdAt === "number");
        setRows(validRows);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Could not load the leaderboard.");
        setRows([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [role, scenarioId]);

  return (
    <section className="leaderboard-area">
      <div className="leaderboard-controls">
        <label className="field-label">Scenario<select value={scenarioId} onChange={(event) => setScenarioId(event.target.value)}>{scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}</select></label>
        <fieldset className="role-picker"><legend>Leaderboard</legend>{(["chaos", "defender"] as const).map((item) => <label key={item} className={role === item ? "active" : ""}><input type="radio" name="leaderboard-role" checked={role === item} onChange={() => setRole(item)} /><span>{item === "chaos" ? "Chaos" : "Defender"}</span></label>)}</fieldset>
      </div>
      {error && <p role="alert" className="alert error">{error} Confirm the AlpenChaos server is running and <code>NEXT_PUBLIC_API_URL</code> is configured.</p>}
      <div className="leaderboard-table-wrap">
        <div className="table-heading"><span>RANK / PLAYER</span><span>SCORE</span><span>MATCH</span><span>PLAYED</span></div>
        {loading ? <p className="table-message">Loading leaderboard…</p> : rows.length ? <ol className="leaderboard-table">{rows.map((row, index) => <li key={`${row.matchId}-${index}`}><span className="rank-name"><b>{String(index + 1).padStart(2, "0")}</b><strong>{row.name}</strong></span><strong className="table-score">{row.score}</strong><Link href={`/replays/${encodeURIComponent(row.matchId)}`} className="table-replay">View replay ↗</Link><time>{new Date(row.createdAt).toLocaleDateString()}</time></li>)}</ol> : !error ? <p className="table-message">No completed matches for this scenario yet. Play a live match to create the first score.</p> : null}
      </div>
    </section>
  );
}
