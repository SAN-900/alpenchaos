"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiUrl, readApiError } from "../lib/api";

type MatchReplay = {
  id: string;
  scenarioId: string;
  roomId: string;
  winner: "chaos" | "defender";
  reason: string;
  simMs: number;
  createdAt: number;
  longestStallMs: number;
  objectiveMet: boolean | null;
  actions: { t: number; role: "chaos" | "defender"; action: { type: string; [key: string]: unknown } }[];
  players: { role: "chaos" | "defender"; name: string; score: number }[];
};

function isReplay(value: unknown): value is MatchReplay {
  if (typeof value !== "object" || value === null || !("actions" in value) || !Array.isArray(value.actions) ||
    !("players" in value) || !Array.isArray(value.players)) return false;
  return "id" in value && typeof value.id === "string" && "scenarioId" in value && typeof value.scenarioId === "string" &&
    "roomId" in value && typeof value.roomId === "string" && "winner" in value &&
    (value.winner === "chaos" || value.winner === "defender") && "reason" in value && typeof value.reason === "string" &&
    "simMs" in value && typeof value.simMs === "number" && "createdAt" in value && typeof value.createdAt === "number" &&
    "longestStallMs" in value && typeof value.longestStallMs === "number" && "objectiveMet" in value &&
    (typeof value.objectiveMet === "boolean" || value.objectiveMet === null);
}

export function ReplayView({ matchId }: { matchId: string }) {
  const [replay, setReplay] = useState<MatchReplay>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch(apiUrl(`/replays/${encodeURIComponent(matchId)}`), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readApiError(response));
        const result: unknown = await response.json();
        if (!isReplay(result)) throw new Error("The server returned an invalid replay record.");
        setReplay(result);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Could not load this replay.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [matchId]);

  if (loading) return <main className="page replay-page"><p className="hint">Loading match replay…</p></main>;
  if (error || !replay) return <main className="page replay-page"><Link href="/scores" className="back">← Scores</Link><div className="empty-state"><h1>Replay unavailable.</h1><p>{error || "No replay data was returned."}</p><p>Replays are held by the game server and may expire or be unavailable if the server has restarted.</p></div></main>;

  return (
    <main className="page replay-page rise">
      <header className="head"><Link href="/scores" className="back">← Scores</Link><p className="eyebrow">MATCH REPLAY / {replay.id}</p><h1>{replay.winner} takes the match.</h1><p className="tagline">{replay.reason}</p></header>
      <section className="replay-stats"><div><span>SCENARIO</span><strong>{replay.scenarioId}</strong></div><div><span>SIMULATED TIME</span><strong>{(replay.simMs / 1000).toFixed(1)}s</strong></div><div><span>LONGEST STALL</span><strong>{(replay.longestStallMs / 1000).toFixed(1)}s</strong></div><div><span>OBJECTIVE</span><strong>{replay.objectiveMet === null ? "N/A" : replay.objectiveMet ? "MET" : "NOT MET"}</strong></div></section>
      <section className="replay-players"><h2>Match results</h2>{replay.players.map((player) => <div key={player.role}><span className={`role-mark ${player.role}`} /> <strong>{player.name}</strong><span>{player.role}</span><b>{player.score} pts</b></div>)}</section>
      <section className="replay-actions"><div className="panel-heading"><div><span className="panel-index">DETERMINISTIC ACTION LOG</span><h2>{replay.actions.length} actions</h2></div><span className="hint">{new Date(replay.createdAt).toLocaleString()}</span></div>{replay.actions.length ? <ol>{replay.actions.map((item, index) => <li key={`${item.t}-${index}`}><time>{(item.t / 1000).toFixed(1)}s</time><span className={`role-mark ${item.role}`} /><strong>{item.role}</strong><code>{item.action.type}</code></li>)}</ol> : <p className="arena-note">This match ended without logged player actions.</p>}</section>
      <div className="doc-footnote"><span>Want to play a match?</span><Link href="/arena">Create or join an arena room <b>↗</b></Link></div>
    </main>
  );
}
