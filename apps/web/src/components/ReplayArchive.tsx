"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiUrl, readApiError } from "../lib/api";

type ReplaySummary = {
  id: string;
  scenarioId: string;
  winner: "chaos" | "defender";
  reason: string;
  simMs: number;
  createdAt: number;
  players: { role: "chaos" | "defender"; name: string; score: number }[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseReplay(value: unknown): ReplaySummary | undefined {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.scenarioId !== "string" ||
    (value.winner !== "chaos" && value.winner !== "defender") || typeof value.reason !== "string" ||
    typeof value.simMs !== "number" || !Number.isFinite(value.simMs) ||
    typeof value.createdAt !== "number" || !Number.isFinite(value.createdAt) ||
    !Array.isArray(value.players)) return;
  const players: ReplaySummary["players"] = [];
  for (const player of value.players) {
    if (!isRecord(player) || (player.role !== "chaos" && player.role !== "defender") ||
      typeof player.name !== "string" || typeof player.score !== "number" || !Number.isFinite(player.score)) return;
    players.push({ role: player.role, name: player.name, score: player.score });
  }
  return {
    id: value.id,
    scenarioId: value.scenarioId,
    winner: value.winner,
    reason: value.reason,
    simMs: value.simMs,
    createdAt: value.createdAt,
    players,
  };
}

export function ReplayArchive() {
  const [replays, setReplays] = useState<ReplaySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch(apiUrl("/replays?limit=50"), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readApiError(response));
        const result: unknown = await response.json();
        if (!isRecord(result) || !Array.isArray(result.replays)) {
          throw new Error("The server returned an invalid replay archive.");
        }
        const parsed: ReplaySummary[] = [];
        for (const item of result.replays) {
          const replay = parseReplay(item);
          if (!replay) throw new Error("The server returned an invalid replay record.");
          parsed.push(replay);
        }
        setReplays(parsed);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Could not load match replays.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  return (
    <main className="page replay-page rise">
      <header className="head">
        <Link href="/scores" className="back">← Scores</Link>
        <p className="eyebrow">DETERMINISTIC MATCH RECORDS</p>
        <h1>Replay archive.</h1>
        <p className="tagline">Re-run completed arena matches from their original scenario and action log.</p>
      </header>
      {error && <p role="alert" className="alert error">{error} Confirm the AlpenChaos server is running and <code>NEXT_PUBLIC_API_URL</code> is configured.</p>}
      {loading ? <p className="hint">Loading replays…</p> : error ? null : replays.length ? (
        <ol className="replay-archive-list">
          {replays.map((replay) => {
            const chaos = replay.players.find((player) => player.role === "chaos");
            const defender = replay.players.find((player) => player.role === "defender");
            return (
              <li key={replay.id}>
                <Link href={`/replays/${encodeURIComponent(replay.id)}`} className="replay-archive-row">
                  <span className={`role-mark ${replay.winner}`} />
                  <span className="replay-archive-main">
                    <strong>{chaos?.name ?? "Chaos"} <i>{chaos?.score ?? "—"}</i><span>vs</span>{defender?.name ?? "Defender"} <i>{defender?.score ?? "—"}</i></strong>
                    <small>{replay.scenarioId} <span>·</span> {(replay.simMs / 1000).toFixed(1)}s <span>·</span> {replay.reason}</small>
                  </span>
                  <span className="replay-archive-meta"><time dateTime={new Date(replay.createdAt).toISOString()}>{new Date(replay.createdAt).toLocaleDateString()}</time><b>{replay.winner} won</b></span>
                  <span className="replay-archive-arrow" aria-hidden="true">↗</span>
                </Link>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="empty-state">
          <span aria-hidden="true">◷</span>
          <h2>No completed matches yet</h2>
          <p>Finish an online arena match and its deterministic replay will appear here.</p>
          <Link href="/arena" className="btn primary">Enter the arena <span>↗</span></Link>
        </div>
      )}
    </main>
  );
}
