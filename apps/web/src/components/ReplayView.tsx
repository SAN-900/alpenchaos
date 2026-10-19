"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { energyUnits, type Action, type GameSession, type LoggedAction, type Role } from "@alpenchaos/game-rules";
import type { NetworkState } from "@alpenchaos/network-simulator";
import { createScenarioSession, dailyScenario, getScenario, type Scenario } from "@alpenchaos/scenarios";
import { apiUrl, readApiError } from "../lib/api";

type MatchReplay = {
  id: string;
  scenarioId: string;
  roomId: string;
  winner: Role;
  reason: string;
  simMs: number;
  createdAt: number;
  longestStallMs: number;
  objectiveMet: boolean | null;
  actions: LoggedAction[];
  players: { role: Role; name: string; score: number }[];
};

type ReplayFrame = {
  now: number;
  slot: number;
  leader: number;
  validators: NetworkState["validators"];
  groups: number[];
  chaosScore: number;
  defenderScore: number;
  chaosEnergy: number;
  defenderEnergy: number;
  finalized: number;
  skipped: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAction(value: unknown): Action | undefined {
  if (!isRecord(value) || typeof value.type !== "string") return;
  switch (value.type) {
    case "killLeader":
    case "lossBurst":
    case "reviveAll":
    case "healPartition":
      return { type: value.type };
    case "killValidator":
    case "slowValidator":
    case "revive":
      return Number.isInteger(value.v) && Number(value.v) >= 0 ? { type: value.type, v: Number(value.v) } : undefined;
    case "partition":
      return typeof value.pct === "number" && Number.isFinite(value.pct) ? { type: value.type, pct: value.pct } : undefined;
    case "sendTx":
      return value.id === undefined || typeof value.id === "string" ? { type: value.type, ...(typeof value.id === "string" ? { id: value.id } : {}) } : undefined;
    default:
      return;
  }
}

function parseReplay(value: unknown): MatchReplay | undefined {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.scenarioId !== "string" ||
    typeof value.roomId !== "string" || (value.winner !== "chaos" && value.winner !== "defender") ||
    typeof value.reason !== "string" || typeof value.simMs !== "number" || !Number.isFinite(value.simMs) ||
    typeof value.createdAt !== "number" || !Number.isFinite(value.createdAt) ||
    typeof value.longestStallMs !== "number" || !Number.isFinite(value.longestStallMs) ||
    (value.objectiveMet !== null && typeof value.objectiveMet !== "boolean") ||
    !Array.isArray(value.actions) || !Array.isArray(value.players)) return;
  const actions: LoggedAction[] = [];
  for (const item of value.actions) {
    if (!isRecord(item) || typeof item.t !== "number" || !Number.isFinite(item.t) || item.t < 0 ||
      (item.role !== "chaos" && item.role !== "defender")) return;
    const action = parseAction(item.action);
    if (!action) return;
    actions.push({ t: item.t, role: item.role, action });
  }
  const players: MatchReplay["players"] = [];
  for (const item of value.players) {
    if (!isRecord(item) || (item.role !== "chaos" && item.role !== "defender") ||
      typeof item.name !== "string" || typeof item.score !== "number" || !Number.isFinite(item.score)) return;
    players.push({ role: item.role, name: item.name, score: item.score });
  }
  return {
    id: value.id,
    scenarioId: value.scenarioId,
    roomId: value.roomId,
    winner: value.winner,
    reason: value.reason,
    simMs: value.simMs,
    createdAt: value.createdAt,
    longestStallMs: value.longestStallMs,
    objectiveMet: value.objectiveMet,
    actions,
    players,
  };
}

function scenarioFor(id: string): Scenario | undefined {
  const preset = getScenario(id);
  if (preset) return preset;
  const daily = /^daily-(\d{4}-\d{2}-\d{2})$/.exec(id);
  if (!daily) return;
  const day = new Date(`${daily[1]}T00:00:00.000Z`);
  if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== daily[1]) return;
  return dailyScenario(daily[1]);
}

function frameFor(session: GameSession): ReplayFrame {
  const net = session.engine.state.net;
  const game = session.game;
  const slot = Math.floor(session.now / game.cfg.slotMs);
  return {
    now: session.now,
    slot,
    leader: net.leaderSchedule[Math.floor(slot / (net.slotsPerWindow ?? 4)) % net.leaderSchedule.length] ?? 0,
    validators: net.validators,
    groups: net.group,
    chaosScore: game.players.chaos.score,
    defenderScore: game.players.defender.score,
    chaosEnergy: energyUnits(game.players.chaos, game.cfg, session.now),
    defenderEnergy: energyUnits(game.players.defender, game.cfg, session.now),
    finalized: game.frontier,
    skipped: game.feed.filter((item) => item.text.includes("skipped")).length,
  };
}

function fmt(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

export function ReplayView({ matchId }: { matchId: string }) {
  const [replay, setReplay] = useState<MatchReplay>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [frame, setFrame] = useState<ReplayFrame>();
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [position, setPosition] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const sessionRef = useRef<GameSession | null>(null);
  const actionIndexRef = useRef(0);
  const positionRef = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    setReplay(undefined);
    setFrame(undefined);
    setError("");
    setLoading(true);
    setPlaying(false);
    fetch(apiUrl(`/replays/${encodeURIComponent(matchId)}`), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readApiError(response));
        const result: unknown = await response.json();
        const parsed = parseReplay(result);
        if (!parsed) throw new Error("The server returned an invalid replay record.");
        if (!scenarioFor(parsed.scenarioId)) throw new Error(`Scenario ${parsed.scenarioId} is not available for replay.`);
        setReplay(parsed);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Could not load this replay.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [matchId]);

  const seekTo = useCallback((requestedTime: number, reset = false) => {
    if (!replay) return;
    const scenario = scenarioFor(replay.scenarioId);
    if (!scenario) {
      setError(`Scenario ${replay.scenarioId} is not available for replay.`);
      setPlaying(false);
      return;
    }
    let session = sessionRef.current;
    if (reset || !session || requestedTime < positionRef.current) {
      session = createScenarioSession(scenario);
      sessionRef.current = session;
      actionIndexRef.current = 0;
      positionRef.current = 0;
    }
    const target = Math.min(replay.simMs, Math.max(0, requestedTime));
    const actions = replay.actions;
    try {
      while (actionIndexRef.current < actions.length && actions[actionIndexRef.current]!.t <= target) {
        const action = actions[actionIndexRef.current]!;
        session.advance(action.t);
        const outcome = session.act(action.role, action.action);
        if (!outcome.ok) throw new Error(`Could not replay ${action.action.type} at ${fmt(action.t)}: ${outcome.reason}.`);
        actionIndexRef.current += 1;
      }
      session.advance(target);
      positionRef.current = session.now;
      setPosition(session.now);
      setFrame(frameFor(session));
      setError("");
    } catch (cause) {
      setPlaying(false);
      setError(cause instanceof Error ? cause.message : "The simulation could not replay this match.");
    }
  }, [replay]);

  useEffect(() => {
    if (replay) seekTo(0, true);
  }, [replay, seekTo]);

  useEffect(() => {
    if (!playing || !replay) return;
    const timer = window.setInterval(() => {
      const target = Math.min(replay.simMs, positionRef.current + 100 * speed);
      seekTo(target);
      if (target >= replay.simMs) setPlaying(false);
    }, 100);
    return () => window.clearInterval(timer);
  }, [playing, replay, seekTo, speed]);

  if (loading) return <main className="page replay-page"><p className="hint">Loading match replay…</p></main>;
  if (error && !replay) return <main className="page replay-page"><Link href="/replays" className="back">← Replay archive</Link><div className="empty-state"><h1>Replay unavailable.</h1><p>{error}</p><p>Replays are retained by the game server and may be unavailable if the server has restarted.</p></div></main>;
  if (!replay || !frame) return <main className="page replay-page"><p className="hint">Preparing deterministic replay…</p></main>;

  const progress = replay.simMs > 0 ? position / replay.simMs * 100 : 100;
  const displayTime = drag ?? position;

  return (
    <main className="page replay-page replay-detail rise">
      <header className="replay-detail-header">
        <div>
          <Link href="/replays" className="back">← Replay archive</Link>
          <p className="eyebrow">DETERMINISTIC MATCH REPLAY / {replay.id}</p>
          <h1>{replay.winner} takes the match.</h1>
          <p className="tagline">{replay.reason}</p>
        </div>
        <span className={`replay-winner-badge ${replay.winner}`}><i />{replay.winner} victory</span>
      </header>
      <section className="replay-stats">
        <div><span>SCENARIO</span><strong>{replay.scenarioId}</strong></div>
        <div><span>SIMULATED TIME</span><strong>{fmt(replay.simMs)}</strong></div>
        <div><span>LONGEST STALL</span><strong>{fmt(replay.longestStallMs)}</strong></div>
        <div><span>OBJECTIVE</span><strong>{replay.objectiveMet === null ? "N/A" : replay.objectiveMet ? "MET" : "NOT MET"}</strong></div>
      </section>
      {error && <p role="alert" className="alert error">{error}</p>}
      <section className="replay-engine" aria-label="Deterministic simulation playback">
        <header className="replay-engine-head">
          <div><span className="panel-index">ENGINE RE-SIMULATION</span><h2>Live match replay</h2><p>Slot {frame.slot} <i>·</i> leader v{frame.leader} <i>·</i> {frame.validators.length} validators</p></div>
          <span className="replay-engine-status"><i />{position >= replay.simMs ? "COMPLETE" : playing ? "PLAYING" : "PAUSED"}</span>
        </header>
        <div className="replay-validator-grid">
          {frame.validators.map((validator, index) => {
            const partitioned = frame.groups[index] !== 0;
            return <div key={validator.id} className={`replay-validator${index === frame.leader ? " is-leader" : ""}${!validator.up ? " is-offline" : partitioned ? " is-partitioned" : ""}`} title={`${validator.id} · ${!validator.up ? "offline" : partitioned ? "partitioned" : "online"}`}>
              <i /> <strong>{validator.id}</strong>{index === frame.leader && <small>LEADER</small>}
            </div>;
          })}
        </div>
        <div className="replay-engine-stats">
          <div><span>CHAOS</span><strong>{frame.chaosScore}</strong><small>{frame.chaosEnergy.toFixed(1)} energy</small></div>
          <div><span>FINALIZED BLOCKS</span><strong>{frame.finalized}</strong><small>{frame.skipped} skipped events</small></div>
          <div><span>DEFENDER</span><strong>{frame.defenderScore}</strong><small>{frame.defenderEnergy.toFixed(1)} energy</small></div>
        </div>
        <div className="replay-controls">
          <button type="button" className="replay-play-button" aria-label={playing ? "Pause replay" : position >= replay.simMs ? "Replay again" : "Play replay"} onClick={() => {
            if (playing) setPlaying(false);
            else {
              if (position >= replay.simMs) seekTo(0, true);
              setPlaying(true);
            }
          }}>{playing ? "Ⅱ" : position >= replay.simMs ? "↻" : "▶"}</button>
          <input type="range" min={0} max={replay.simMs} step={100} value={displayTime}
            onChange={(event) => setDrag(Number(event.target.value))}
            onPointerUp={() => { if (drag !== null) seekTo(drag, true); setDrag(null); }}
            onKeyUp={() => { if (drag !== null) seekTo(drag, true); setDrag(null); }}
            onBlur={() => { if (drag !== null) seekTo(drag, true); setDrag(null); }}
            aria-label="Replay position" />
          <time>{fmt(displayTime)} <i>/</i> {fmt(replay.simMs)}</time>
          <div className="replay-speed" role="group" aria-label="Replay speed">
            {[1, 2, 4].map((rate) => <button type="button" key={rate} className={speed === rate ? "active" : ""} aria-pressed={speed === rate} onClick={() => setSpeed(rate)}>{rate}×</button>)}
          </div>
        </div>
      </section>
      <section className="replay-players">
        <h2>Match results</h2>
        {replay.players.map((player) => <div key={player.role}><span className={`role-mark ${player.role}`} /> <strong>{player.name}</strong><span>{player.role}</span><b>{player.score} pts</b></div>)}
      </section>
      <section className="replay-actions">
        <div className="panel-heading"><div><span className="panel-index">DETERMINISTIC ACTION LOG</span><h2>{replay.actions.length} actions</h2></div><span className="hint">{new Date(replay.createdAt).toLocaleString()}</span></div>
        {replay.actions.length ? <ol>{replay.actions.map((item, index) => <li key={`${item.t}-${index}`} className={item.t <= position ? "replayed" : ""}><time>{fmt(item.t)}</time><span className={`role-mark ${item.role}`} /><strong>{item.role}</strong><code>{item.action.type}</code></li>)}</ol> : <p className="arena-note">This match ended without logged player actions.</p>}
      </section>
      <div className="doc-footnote"><span>Want to play a match?</span><Link href="/arena">Create or join an arena room <b>↗</b></Link></div>
    </main>
  );
}
