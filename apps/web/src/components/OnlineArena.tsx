"use client";

import { dailyScenario, listScenarios } from "@alpenchaos/scenarios";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Action, Role } from "@alpenchaos/game-rules";
import { apiUrl, readApiError, websocketUrl } from "../lib/api";

type Validator = { id: string; stake: number; up: boolean; partitionGroup: number; extraDelayMs: number };
type GameSnapshot = {
  clock: { slot: number; leader: number };
  network: { totalStake: number; validators: Validator[] };
  consensus: {
    alpenglow: { finalized: number; skipped: number; fastPath: number; slowPath: number };
    towerBft: { finalized: number; skipped: number };
  };
  game?: { over: { winner: Role; reason: string } | null; stallMs: number; feed: { t: number; text: string }[] };
};
type PlayerMetric = { score: number; energy: number };
type Presence = { chaos: { name: string; connected: boolean } | null; defender: { name: string; connected: boolean } | null };
type FeedItem = { t: number; text: string };

const playScenarios = [...listScenarios(), dailyScenario()]
  .filter((scenario) => scenario.mode === "play")
  .map(({ id, name }) => ({ id, name }));
const chaosActions: { label: string; action: Action }[] = [
  { label: "Disrupt current leader", action: { type: "killLeader" } },
  { label: "Partition 20% stake", action: { type: "partition", pct: 20 } },
  { label: "Packet loss burst", action: { type: "lossBurst" } },
];
const defenderActions: { label: string; action: Action }[] = [
  { label: "Send transaction", action: { type: "sendTx" } },
  { label: "Heal partition", action: { type: "healPartition" } },
  { label: "Revive all validators", action: { type: "reviveAll" } },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseSnapshot(value: unknown): GameSnapshot | undefined {
  if (!isRecord(value) || !isRecord(value.clock) || !isRecord(value.network) || !isRecord(value.consensus)) return;
  const validators = value.network.validators;
  const ag = value.consensus.alpenglow;
  const tb = value.consensus.towerBft;
  if (!Array.isArray(validators) || !isRecord(ag) || !isRecord(tb)) return;
  if (!isNumber(value.clock.slot) || !isNumber(value.clock.leader) || !isNumber(value.network.totalStake)) return;
  if (!isNumber(ag.finalized) || !isNumber(ag.skipped) || !isNumber(ag.fastPath) ||
    !isNumber(ag.slowPath) || !isNumber(tb.finalized) || !isNumber(tb.skipped)) return;
  const parsedValidators: Validator[] = [];
  for (const validator of validators) {
    if (!isRecord(validator) || typeof validator.id !== "string" || typeof validator.up !== "boolean" ||
      !isNumber(validator.stake) || !isNumber(validator.partitionGroup) || !isNumber(validator.extraDelayMs)) return;
    parsedValidators.push({
      id: validator.id,
      up: validator.up,
      stake: validator.stake,
      partitionGroup: validator.partitionGroup,
      extraDelayMs: validator.extraDelayMs,
    });
  }
  const game = isRecord(value.game) ? value.game : undefined;
  const parsedGame: GameSnapshot["game"] = game
    ? {
        over: isRecord(game.over) && (game.over.winner === "chaos" || game.over.winner === "defender") && typeof game.over.reason === "string"
          ? { winner: game.over.winner, reason: game.over.reason } : null,
        stallMs: isNumber(game.stallMs) ? game.stallMs : 0,
        feed: Array.isArray(game.feed) ? game.feed.filter((entry): entry is FeedItem =>
          isRecord(entry) && isNumber(entry.t) && typeof entry.text === "string") : [],
      }
    : undefined;
  return {
    clock: { slot: value.clock.slot, leader: value.clock.leader },
    network: { totalStake: value.network.totalStake, validators: parsedValidators },
    consensus: {
      alpenglow: { finalized: ag.finalized, skipped: ag.skipped, fastPath: ag.fastPath, slowPath: ag.slowPath },
      towerBft: { finalized: tb.finalized, skipped: tb.skipped },
    },
    ...(parsedGame ? { game: parsedGame } : {}),
  };
}

function parsePlayers(value: unknown): Partial<Record<Role, PlayerMetric>> | undefined {
  if (!isRecord(value)) return;
  const out: Partial<Record<Role, PlayerMetric>> = {};
  for (const role of ["chaos", "defender"] as const) {
    const item = value[role];
    if (isRecord(item) && isNumber(item.score) && isNumber(item.energy)) out[role] = { score: item.score, energy: item.energy };
  }
  return out;
}

function getSeatToken(room: string): string | undefined {
  return window.sessionStorage.getItem(`alpenchaos:room:${room}:token`) ?? undefined;
}

export function OnlineArena() {
  const [roomId, setRoomId] = useState("");
  const [joinId, setJoinId] = useState("");
  const [scenarioId, setScenarioId] = useState(playScenarios[0]?.id ?? "");
  const [role, setRole] = useState<Role | "spectator">("chaos");
  const [name, setName] = useState("");
  const [seat, setSeat] = useState<Role | "spectator">("spectator");
  const [scenarioName, setScenarioName] = useState("");
  const [roomStatus, setRoomStatus] = useState<"lobby" | "running" | "over">("lobby");
  const [connection, setConnection] = useState<"connecting" | "connected" | "disconnected">("disconnected");
  const [state, setState] = useState<GameSnapshot>();
  const [players, setPlayers] = useState<Partial<Record<Role, PlayerMetric>>>({});
  const [presence, setPresence] = useState<Presence>({ chaos: null, defender: null });
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [simTimeMs, setSimTimeMs] = useState(0);
  const [matchId, setMatchId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reconnectKey, setReconnectKey] = useState(0);
  const [selectedValidator, setSelectedValidator] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!roomId) return;
    setConnection("connecting");
    setError("");
    const socket = new WebSocket(websocketUrl("/ws/match"));
    socketRef.current = socket;
    socket.onopen = () => {
      setConnection("connected");
      const token = getSeatToken(roomId);
      socket.send(JSON.stringify({
        t: "join",
        room: roomId,
        role: token ? undefined : role,
        ...(token ? { token } : {}),
        name: name.trim() || "player",
      }));
    };
    socket.onmessage = (event) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(event.data));
      } catch {
        setError("The match server sent an unreadable message.");
        return;
      }
      if (!isRecord(parsed) || typeof parsed.t !== "string") {
        setError("The match server sent an unexpected message.");
        return;
      }
      if (parsed.t === "joined") {
        if (typeof parsed.room === "string") setRoomId(parsed.room);
        if (parsed.seat === "chaos" || parsed.seat === "defender" || parsed.seat === "spectator") setSeat(parsed.seat);
        if (typeof parsed.token === "string") window.sessionStorage.setItem(`alpenchaos:room:${roomId}:token`, parsed.token);
        if (parsed.status === "lobby" || parsed.status === "running" || parsed.status === "over") setRoomStatus(parsed.status);
        if (isRecord(parsed.scenario) && typeof parsed.scenario.name === "string") setScenarioName(parsed.scenario.name);
        const initial = parseSnapshot(parsed.state);
        if (initial) setState(initial);
        const metrics = parsePlayers(parsed.players);
        if (metrics) setPlayers(metrics);
      } else if (parsed.t === "presence") {
        if (isRecord(parsed.seats)) {
          const toSeat = (value: unknown) => isRecord(value) && typeof value.name === "string" && typeof value.connected === "boolean"
            ? { name: value.name, connected: value.connected } : null;
          setPresence({ chaos: toSeat(parsed.seats.chaos), defender: toSeat(parsed.seats.defender) });
        }
      } else if (parsed.t === "started") {
        setRoomStatus("running");
        if (isNumber(parsed.simTimeMs)) setSimTimeMs(parsed.simTimeMs);
      } else if (parsed.t === "tick") {
        if (isNumber(parsed.simTimeMs)) setSimTimeMs(parsed.simTimeMs);
        const metrics = parsePlayers(parsed.players);
        if (metrics) setPlayers(metrics);
        const next = parseSnapshot(parsed.state);
        if (next) setState(next);
      } else if (parsed.t === "feed" && isRecord(parsed.entry)) {
        const entry = parsed.entry;
        if (isNumber(entry.t) && typeof entry.text === "string") {
          const item: FeedItem = { t: entry.t, text: entry.text };
          setFeed((items) => [...items.slice(-49), item]);
        }
        const metrics = parsePlayers(parsed.players);
        if (metrics) setPlayers(metrics);
      } else if (parsed.t === "actionResult") {
        setMessage(parsed.ok === true ? "Action accepted." : `Action rejected${typeof parsed.reason === "string" ? `: ${parsed.reason}` : "."}`);
      } else if (parsed.t === "over") {
        setRoomStatus("over");
        if (typeof parsed.matchId === "string") setMatchId(parsed.matchId);
        const finalState = parseSnapshot(parsed.state);
        if (finalState) setState(finalState);
        const metrics = parsePlayers(parsed.players);
        if (metrics) setPlayers(metrics);
      } else if (parsed.t === "error") {
        setError(typeof parsed.message === "string" ? parsed.message : "The match server returned an error.");
      } else if (parsed.t === "closed") {
        setRoomStatus("over");
        setMessage(typeof parsed.reason === "string" ? parsed.reason : "This room has closed.");
      }
    };
    socket.onerror = () => setError("Could not connect to the match server. Check the server URL and that the server is running.");
    socket.onclose = () => setConnection("disconnected");
    const keepalive = window.setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ t: "ping" }));
    }, 30_000);
    return () => {
      window.clearInterval(keepalive);
      socket.close();
      socketRef.current = null;
    };
  }, [roomId, role, name, reconnectKey]);

  const activePlayer = seat === "chaos" || seat === "defender";
  const validator = state?.network.validators[selectedValidator];
  const actionDeck = seat === "chaos" ? chaosActions : seat === "defender" ? defenderActions : [];
  const canAct = roomStatus === "running" && activePlayer && connection === "connected";
  const sortedFeed = useMemo(() => [...feed].reverse(), [feed]);

  async function createRoom() {
    if (!scenarioId) return setError("There are no play-mode scenarios available.");
    setBusy(true);
    setError("");
    try {
      const response = await fetch(apiUrl("/rooms"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenarioId }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      const result: unknown = await response.json();
      if (!isRecord(result) || typeof result.roomId !== "string") throw new Error("The server returned an invalid room response.");
      setRole(role === "spectator" ? "chaos" : role);
      setRoomId(result.roomId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create a room.");
    } finally {
      setBusy(false);
    }
  }

  function enterRoom() {
    const id = joinId.trim();
    if (!/^[A-Za-z0-9-]{1,64}$/.test(id)) return setError("Enter a valid room code (letters, numbers, and dashes).");
    setError("");
    setRoomStatus("lobby");
    setState(undefined);
    setFeed([]);
    setMatchId("");
    setRoomId(id);
  }

  function sendAction(action: Action) {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || !canAct) return;
    socket.send(JSON.stringify({ t: "action", action }));
    setMessage("Action sent to the match server…");
  }

  async function copyRoomCode() {
    try {
      await navigator.clipboard.writeText(roomId);
      setMessage("Room code copied.");
    } catch {
      setError("Could not copy the room code. Select and copy it manually.");
    }
  }

  if (!roomId) {
    return (
      <main className="page arena-page rise">
        <header className="head"><p className="eyebrow">LIVE MULTIPLAYER</p><h1>Enter the arena.</h1><p className="tagline">Create a room and invite an opponent, join a match, or watch as a spectator.</p></header>
        <div className="arena-entry-grid">
          <section className="arena-panel">
            <span className="panel-index">01 / HOST A MATCH</span><h2>Create a room</h2><p>Choose a scenario and your role. Share the room code so another player can take the other side.</p>
            <label className="field-label">Scenario<select value={scenarioId} onChange={(event) => setScenarioId(event.target.value)} disabled={!playScenarios.length}>{playScenarios.map((scenario) => <option value={scenario.id} key={scenario.id}>{scenario.name}</option>)}</select></label>
            <label className="field-label">Your display name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={24} placeholder="e.g. validator_01" /></label>
            <RoleSelect role={role} onChange={setRole} />
            <button className="btn primary arena-submit" onClick={createRoom} disabled={busy || !playScenarios.length}>{busy ? "Creating room…" : "Create multiplayer room"} <span>↗</span></button>
          </section>
          <section className="arena-panel">
            <span className="panel-index">02 / JOIN A MATCH</span><h2>Have a room code?</h2><p>Enter the code shared by the host. Select your seat, or join as a spectator.</p>
            <label className="field-label">Room code<input value={joinId} onChange={(event) => setJoinId(event.target.value)} maxLength={64} placeholder="e.g. a1b2c3d4" onKeyDown={(event) => { if (event.key === "Enter") enterRoom(); }} /></label>
            <label className="field-label">Your display name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={24} placeholder="e.g. validator_02" /></label>
            <RoleSelect role={role} onChange={setRole} />
            <button className="btn arena-submit" onClick={enterRoom}>Join room <span>→</span></button>
          </section>
        </div>
        {error && <p className="alert error" role="alert">{error}</p>}
        <p className="arena-note">Online play requires the AlpenChaos server. Set <code>NEXT_PUBLIC_API_URL</code> to its public HTTP(S) origin when deployed.</p>
      </main>
    );
  }

  return (
    <main className="page arena-page rise">
      <header className="arena-header">
        <div><button className="back-button" onClick={() => { socketRef.current?.close(); setRoomId(""); setError(""); }}>← Leave room</button><p className="eyebrow">ROOM / {roomId}</p><h1>{scenarioName || "Connecting to arena…"}</h1><p className="tagline">You joined as <strong>{seat}</strong> · {connection}</p></div>
        <div className="arena-header-actions"><button className="btn" onClick={copyRoomCode}>Copy room code</button>{connection === "disconnected" && <button className="btn" onClick={() => setReconnectKey((value) => value + 1)}>Reconnect</button>}</div>
      </header>
      {error && <p className="alert error" role="alert">{error}</p>}
      <section className="room-toolbar"><div><span className={`connection-dot ${connection}`} />{roomStatus === "lobby" ? "WAITING FOR PLAYERS" : roomStatus === "running" ? "MATCH IN PROGRESS" : "MATCH COMPLETE"}</div><span>SIM TIME {`${(simTimeMs / 1000).toFixed(1)}s`} · SLOT {state?.clock.slot ?? 0}</span></section>
      {roomStatus === "lobby" && <section className="presence-grid">{(["chaos", "defender"] as const).map((side) => <div key={side} className="presence-card"><span className={`presence-icon ${side}`}>{side === "chaos" ? "⟡" : "◇"}</span><div><span className="presence-label">{side.toUpperCase()} SEAT</span><strong>{presence[side]?.name ?? "Waiting for player…"}</strong></div><span className={`seat-state${presence[side]?.connected ? " online" : ""}`}>{presence[side]?.connected ? "CONNECTED" : "OPEN"}</span></div>)}</section>}

      <section className="arena-scoreboard">
        <div className="score-card"><span>ALPENGLOW FINALIZED</span><strong>{state?.consensus.alpenglow.finalized ?? 0}</strong><small>{state?.consensus.alpenglow.fastPath ?? 0} fast · {state?.consensus.alpenglow.slowPath ?? 0} slow</small></div>
        <div className="score-card legacy"><span>TOWER BFT FINALIZED</span><strong>{state?.consensus.towerBft.finalized ?? 0}</strong><small>{state?.consensus.towerBft.skipped ?? 0} skipped slots</small></div>
        <div className="score-card"><span>CHAOS / {players.chaos?.score ?? 0}</span><strong>{players.chaos?.energy.toFixed(1) ?? "0.0"}</strong><small>energy units</small></div>
        <div className="score-card defender"><span>DEFENDER / {players.defender?.score ?? 0}</span><strong>{players.defender?.energy.toFixed(1) ?? "0.0"}</strong><small>energy units</small></div>
      </section>

      <section className="arena-live-grid">
        <div className="arena-panel network-panel"><div className="panel-heading"><div><span className="panel-index">LIVE TOPOLOGY</span><h2>Validator network</h2></div><span className="hint">{state?.network.validators.length ?? 0} validators · leader v{state?.clock.leader ?? 0}</span></div>
          <div className="validator-grid">{state?.network.validators.map((v, index) => <button key={v.id} type="button" onClick={() => setSelectedValidator(index)} className={`validator-card${selectedValidator === index ? " selected" : ""}${!v.up ? " offline" : ""}${v.partitionGroup !== 0 ? " partitioned" : ""}`} title={`${v.id} · ${v.up ? "online" : "offline"} · ${Math.round(v.stake / Math.max(1, state.network.totalStake) * 100)}% stake`}>
            <span className="validator-led" /><strong>{v.id}</strong><small>{v.up ? `${Math.round(v.stake / Math.max(1, state.network.totalStake) * 100)}%` : "OFFLINE"}</small>{index === state.clock.leader && <i className="leader-tag">LEADER</i>}
          </button>)}</div>
          <div className="legend"><span><i className="green" /> Online</span><span><i className="orange" /> Partitioned</span><span><i className="red" /> Offline</span></div>
        </div>
        <aside className="arena-panel action-panel"><div className="panel-heading"><div><span className="panel-index">YOUR MOVE / {seat.toUpperCase()}</span><h2>Action deck</h2></div></div>
          {!activePlayer ? <p className="arena-note">You&apos;re spectating. Players can use the action deck.</p> : <><p className="selected-validator">Selected validator: <strong>{validator?.id ?? "—"}</strong></p><div className="action-list">
            {actionDeck.map((item) => <button type="button" key={item.label} disabled={!canAct} onClick={() => sendAction(item.action)}>{item.label}<span>↗</span></button>)}
            {activePlayer && <><button type="button" disabled={!canAct || !validator} onClick={() => sendAction(seat === "chaos" ? { type: "killValidator", v: selectedValidator } : { type: "revive", v: selectedValidator })}>{seat === "chaos" ? "Crash selected validator" : "Revive selected validator"}<span>↗</span></button><button type="button" disabled={!canAct || !validator} onClick={() => sendAction({ type: "slowValidator", v: selectedValidator })}>Slow selected validator<span>↗</span></button></>}
          </div></>}
          <p className="action-feedback" aria-live="polite">{message || (roomStatus === "lobby" ? "The match starts automatically when both player seats are filled." : "Actions are validated by the match server.")}</p>
        </aside>
      </section>
      <section className="arena-panel match-feed"><div className="panel-heading"><div><span className="panel-index">EVENT STREAM</span><h2>Match activity</h2></div><span className="hint">{feed.length} events</span></div>{sortedFeed.length ? <ol>{sortedFeed.map((item, index) => <li key={`${item.t}-${index}`}><time>{(item.t / 1000).toFixed(1)}s</time><span>{item.text}</span></li>)}</ol> : <p className="arena-note">Actions and match events will appear here.</p>}</section>
      {state?.game?.over && <section className="match-result"><p className="eyebrow">MATCH COMPLETE</p><h2>{state.game.over.winner === seat ? "Victory." : `${state.game.over.winner} wins.`}</h2><p>{state.game.over.reason}</p>{matchId && <Link href={`/replays/${matchId}`} className="btn primary">View replay <span>↗</span></Link>}</section>}
    </main>
  );
}

function RoleSelect({ role, onChange }: { role: Role | "spectator"; onChange: (role: Role | "spectator") => void }) {
  return <fieldset className="role-picker"><legend>Your seat</legend>{(["chaos", "defender", "spectator"] as const).map((item) => <label key={item} className={role === item ? "active" : ""}><input type="radio" name="arena-role" value={item} checked={role === item} onChange={() => onChange(item)} /><span>{item === "chaos" ? "Chaos" : item === "defender" ? "Defender" : "Spectate"}</span></label>)}</fieldset>;
}
