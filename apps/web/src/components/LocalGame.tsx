"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createScenarioSession, dailyScenario } from "@alpenchaos/scenarios";
import { energyUnits, type Action, type GameSession, type Role } from "@alpenchaos/game-rules";
import type { NetworkState } from "@alpenchaos/network-simulator";
import type { Scenario } from "@alpenchaos/scenarios";

const fmt = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const ACTIONS: Record<Role, { label: string; action: Action; detail: string }[]> = {
  chaos: [
    { label: "Kill current leader", action: { type: "killLeader" }, detail: "Crash the validator scheduled to lead the current slot · 3 energy" },
    { label: "Partition 20% stake", action: { type: "partition", pct: 20 }, detail: "Split part of the network for 10 seconds · 4 energy" },
    { label: "Packet loss burst", action: { type: "lossBurst" }, detail: "Drop a portion of network messages · 2 energy" },
    { label: "Slow validator", action: { type: "slowValidator", v: 0 }, detail: "Add latency to the selected validator · 1 energy" },
    { label: "Crash validator", action: { type: "killValidator", v: 0 }, detail: "Take the selected validator offline · 1 energy" },
  ],
  defender: [
    { label: "Send transaction", action: { type: "sendTx" }, detail: "Submit a transaction and score if it lands · free" },
    { label: "Heal partition", action: { type: "healPartition" }, detail: "Restore communication between groups · 3 energy" },
    { label: "Revive validator", action: { type: "revive", v: 0 }, detail: "Bring the selected validator back online · 1 energy" },
    { label: "Revive all", action: { type: "reviveAll" }, detail: "Restore every offline validator · 5 energy" },
  ],
};

function useLocalSession(scenario: Scenario, role: Role) {
  const sessionRef = useRef<GameSession | null>(null);
  const roleRef = useRef(role);
  const playingRef = useRef(true);
  const lastBotAction = useRef(0);
  const [revision, setRevision] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [message, setMessage] = useState("Match ready. Make your first move.");
  const [selectedValidator, setSelectedValidator] = useState(0);

  useEffect(() => { roleRef.current = role; }, [role]);
  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => {
    sessionRef.current = createScenarioSession(scenario);
    lastBotAction.current = 0;
    setPlaying(true);
    setMessage("Match started. Your opponent is controlled by a local bot.");
    setRevision((v) => v + 1);
    const timer = window.setInterval(() => {
      const session = sessionRef.current;
      if (!session || session.game.over || !playingRef.current) return;
      session.advance(session.now + session.game.cfg.stepMs);
      const humanRole = roleRef.current;
      const botRole: Role = humanRole === "chaos" ? "defender" : "chaos";
      if (!session.game.over && session.now - lastBotAction.current >= 3_000) {
        const world = session.engine.state as { net: NetworkState };
        const net = world.net;
        const down = net.validators.findIndex((v) => !v.up);
        const activePartition = net.group.some((g) => g !== 0);
        const candidates: Action[] = botRole === "defender"
          ? [
              ...(down >= 0 ? [{ type: "revive", v: down } as Action] : []),
              ...(activePartition ? [{ type: "healPartition" } as Action] : []),
              { type: "sendTx" },
              { type: "reviveAll" },
            ]
          : [
              ...(!activePartition ? [{ type: "partition", pct: 20 } as Action] : []),
              { type: "killLeader" },
              { type: "lossBurst" },
              { type: "slowValidator", v: Math.max(0, net.validators.findIndex((v) => v.up)) },
            ];
        for (const action of candidates) {
          const result = session.act(botRole, action);
          if (result.ok) {
            lastBotAction.current = session.now;
            session.game.feed.push({ t: session.now, text: `BOT ${botRole}: ${action.type}` });
            break;
          }
        }
      }
      if (session.game.over) setPlaying(false);
      setRevision((v) => v + 1);
    }, 100);
    return () => window.clearInterval(timer);
  // A role change starts a clean game; restart is handled by the parent key.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario]);

  const act = useCallback((action: Action) => {
    const session = sessionRef.current;
    if (!session || session.game.over) return;
    const result = session.act(roleRef.current, action);
    setMessage(result.ok ? `${roleRef.current.toUpperCase()} action accepted · ${action.type}` : `Action rejected · ${result.reason}`);
    setRevision((v) => v + 1);
  }, []);

  const restart = useCallback(() => {
    sessionRef.current = createScenarioSession(scenario);
    lastBotAction.current = 0;
    setPlaying(true);
    setMessage("New run started. The scenario seed is unchanged.");
    setRevision((v) => v + 1);
  }, [scenario]);

  const togglePlaying = useCallback(() => {
    const session = sessionRef.current;
    if (session?.game.over) return;
    setPlaying((v) => !v);
  }, []);

  const session = sessionRef.current;
  return { session, revision, playing, message, selectedValidator, setSelectedValidator, act, restart, togglePlaying };
}

export function LocalGame() {
  const scenario = useMemo(() => dailyScenario(), []);
  const [role, setRole] = useState<Role>("chaos");
  const [runKey, setRunKey] = useState(0);
  return <LocalGameRound key={`${role}-${runKey}`} scenario={scenario} role={role} onRoleChange={(next) => { setRole(next); setRunKey((v) => v + 1); }} onRestart={() => setRunKey((v) => v + 1)} />;
}

function LocalGameRound({ scenario, role, onRoleChange, onRestart }: { scenario: Scenario; role: Role; onRoleChange: (role: Role) => void; onRestart: () => void }) {
  const game = useLocalSession(scenario, role);
  // Read the latest mutable session state whenever revision changes.
  const session = game.session;
  const state = session?.engine.state as { net: NetworkState; protocols: Record<string, unknown> } | undefined;
  const net = state?.net;
  const currentGame = session?.game;
  const now = session?.now ?? 0;
  const human = currentGame?.players[role];
  const chaosEnergy = currentGame ? energyUnits(currentGame.players.chaos, currentGame.cfg, now) : 0;
  const defenderEnergy = currentGame ? energyUnits(currentGame.players.defender, currentGame.cfg, now) : 0;
  const energy = human && currentGame ? energyUnits(human, currentGame.cfg, now) : 0;
  const progress = currentGame ? Math.min(100, now / currentGame.cfg.durationMs * 100) : 0;
  const leaderIndex = net?.leaderSchedule[Math.floor(now / (currentGame?.cfg.slotMs ?? 400) / (net?.slotsPerWindow ?? 4)) % (net?.leaderSchedule.length ?? 1)] ?? 0;
  const selected = game.selectedValidator;
  const actionList = ACTIONS[role].map((item) => {
    const action = item.action.type === "slowValidator" || item.action.type === "killValidator" || item.action.type === "revive"
      ? { ...item.action, v: selected } as Action : item.action;
    return { ...item, action };
  });
  const validators = net?.validators ?? [];
  const doAction = (action: Action) => game.act(action);

  return (
    <main className="local-game-page">
      <div className="local-game">
        <header className="match-header">
          <div className="match-intro">
            <p className="match-eyebrow"><span className="match-live-dot" /> LOCAL SIMULATION <span className="eyebrow-divider">/</span> NO SERVER REQUIRED</p>
            <h1>Play the network<span className="match-period">.</span></h1>
            <p className="match-description">Attack consensus or defend finality. Every move reshapes the same deterministic Solana network.</p>
          </div>
          <div className="match-toolbar">
            <button type="button" className="match-button" onClick={() => onRoleChange(role === "chaos" ? "defender" : "chaos")}>Switch side <span aria-hidden="true">⇄</span></button>
            <button type="button" className="match-button" onClick={game.togglePlaying} disabled={Boolean(currentGame?.over)}>{game.playing ? "Pause" : "Resume"} <span aria-hidden="true">{game.playing ? "Ⅱ" : "▶"}</span></button>
            <button type="button" className="match-button match-button-primary" onClick={onRestart}>New match <span aria-hidden="true">↻</span></button>
          </div>
        </header>

        <section className="match-overview" aria-label="Your match stats">
          <article className={`overview-card role-card ${role}`}>
            <span className="overview-label">YOUR SIDE</span>
            <div className="role-name"><span className="role-indicator" />{role === "chaos" ? "Chaos" : "Defender"}</div>
            <p>{role === "chaos" ? "Break communication. Slow down finality." : "Restore the network. Keep blocks moving."}</p>
          </article>
          <article className="overview-card">
            <span className="overview-label">YOUR SCORE</span>
            <div className="overview-value">{human?.score ?? 0}<span>pts</span></div>
            <div className="stat-track" role="progressbar" aria-label="Your score" aria-valuenow={Math.min(100, (human?.score ?? 0) / 150 * 100)} aria-valuemin={0} aria-valuemax={100}>
              <span className="score-track-fill" style={{ width: `${Math.min(100, (human?.score ?? 0) / 150 * 100)}%` }} />
            </div>
          </article>
          <article className="overview-card energy-card">
            <span className="overview-label">AVAILABLE ENERGY</span>
            <div className="overview-value">{energy.toFixed(1)}<span>/ 10</span></div>
            <div className="stat-track" role="progressbar" aria-label="Available energy" aria-valuenow={Math.min(100, energy * 10)} aria-valuemin={0} aria-valuemax={100}>
              <span className="energy-track-fill" style={{ width: `${Math.min(100, energy * 10)}%` }} />
            </div>
          </article>
          <article className="overview-card clock-card">
            <span className="overview-label">MATCH CLOCK</span>
            <div className="overview-value clock-value">{fmt(now)}<span> / {fmt(currentGame?.cfg.durationMs ?? 60_000)}</span></div>
            <div className="stat-track" role="progressbar" aria-label="Match progress" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
              <span className="clock-track-fill" style={{ width: `${progress}%` }} />
            </div>
          </article>
        </section>

        <section className="match-workspace" aria-label="Live match controls">
          <article className="match-panel network-panel">
            <header className="panel-header">
              <div>
                <p className="panel-kicker">LIVE TOPOLOGY</p>
                <h2>Validator network</h2>
                <p className="panel-subtitle">{validators.length} validators <span>·</span> slot {Math.floor(now / (currentGame?.cfg.slotMs ?? 400))} <span>·</span> leader v{leaderIndex}</p>
              </div>
              <span className={`match-status${currentGame?.over ? " complete" : game.playing ? " running" : " paused"}`}>
                <i />{currentGame?.over ? "COMPLETE" : game.playing ? "LIVE" : "PAUSED"}
              </span>
            </header>
            <div className="validator-grid">
              {validators.map((v, i) => {
                const isLeader = i === leaderIndex;
                const group = net?.group[i] ?? 0;
                const status = !v.up ? "offline" : group !== 0 ? "partitioned" : "online";
                return (
                  <button
                    type="button"
                    key={v.id}
                    onClick={() => game.setSelectedValidator(i)}
                    title={`${v.id} · ${status} · group ${group}`}
                    aria-pressed={selected === i}
                    className={`validator-card${selected === i ? " selected" : ""}${isLeader ? " leader" : ""}${!v.up ? " offline" : ""}${group !== 0 ? " partitioned" : ""}`}
                  >
                    <span className="validator-topline"><i className="validator-status-dot" />{isLeader && <span className="leader-tag">LEADER</span>}</span>
                    <span className="validator-id">{v.id}</span>
                    <span className="validator-stake">{v.up ? `${Math.round((v.stake / (net?.totalStake || 1)) * 100)}% stake` : "OFFLINE"}</span>
                  </button>
                );
              })}
            </div>
            <footer className="network-legend" aria-label="Validator status key">
              <span><i className="legend-dot online" />Online</span>
              <span><i className="legend-dot partitioned" />Partitioned</span>
              <span><i className="legend-dot offline" />Offline</span>
              <span><i className="legend-dot selected" />Selected</span>
            </footer>
          </article>

          <aside className="match-panel action-panel">
            <header className="panel-header">
              <div>
                <p className="panel-kicker">YOUR MOVE</p>
                <h2>Action deck</h2>
                <p className="panel-subtitle">Select a move for your side</p>
              </div>
              <span className={`side-tag ${role}`}>{role.toUpperCase()}</span>
            </header>
            <div className="action-list">
              {actionList.map((item, index) => (
                <button
                  type="button"
                  key={item.label}
                  onClick={() => doAction(item.action)}
                  disabled={!game.playing || Boolean(currentGame?.over)}
                  className="action-card"
                >
                  <span className="action-index">{String(index + 1).padStart(2, "0")}</span>
                  <span className="action-copy">
                    <span className="action-name">{item.label}<span aria-hidden="true">↗</span></span>
                    <span className="action-detail">{item.detail.replace("selected validator", `selected ${validators[selected]?.id ?? "validator"}`)}</span>
                  </span>
                </button>
              ))}
            </div>
            <p aria-live="polite" className="match-message"><i />{game.message}</p>
          </aside>
        </section>

        <section className="match-lower-grid">
          <article className="match-panel scoreboard-panel">
            <header className="panel-header">
              <div><p className="panel-kicker">THE RACE</p><h2>Scoreboard</h2></div>
              <span className="round-time">{fmt(now)} <i>/</i> {fmt(currentGame?.cfg.durationMs ?? 60_000)}</span>
            </header>
            <div className="score-comparison">
              <div className={`player-score chaos-score${role === "chaos" ? " is-you" : ""}`}>
                <div className="player-label"><i />CHAOS{role === "chaos" && <span>YOU</span>}</div>
                <strong>{currentGame?.players.chaos.score ?? 0}</strong>
                <span className="player-energy">{chaosEnergy.toFixed(1)} energy</span>
              </div>
              <div className="score-divider"><span>VS</span></div>
              <div className={`player-score defender-score${role === "defender" ? " is-you" : ""}`}>
                <div className="player-label"><i />DEFENDER{role === "defender" && <span>YOU</span>}</div>
                <strong>{currentGame?.players.defender.score ?? 0}</strong>
                <span className="player-energy">{defenderEnergy.toFixed(1)} energy</span>
              </div>
            </div>
            {currentGame?.over && (
              <div className="match-result" role="status">
                <div><span className="panel-kicker">{currentGame.over.winner === role ? "VICTORY" : "MATCH COMPLETE"}</span><p>{currentGame.over.reason}</p></div>
                <button type="button" className="match-button match-button-primary" onClick={onRestart}>Play again <span aria-hidden="true">↻</span></button>
              </div>
            )}
          </article>
          <article className="match-panel feed-panel">
            <header className="panel-header">
              <div><p className="panel-kicker">SIMULATION EVENTS</p><h2>Match feed</h2></div>
              <span className="feed-live-label"><i />LATEST</span>
            </header>
            <ol className="match-feed">
              {[...(currentGame?.feed ?? [])].slice(-12).reverse().map((event, i) => (
                <li key={`${event.t}-${event.text}-${i}`}><time>{fmt(event.t)}</time><span>{event.text}</span></li>
              ))}
              {!currentGame?.feed.length && <li className="empty-feed">Events will appear as the match evolves.</li>}
            </ol>
          </article>
        </section>
        <footer className="match-footer"><span>{scenario.name} <i>·</i> seed {scenario.seed} <i>·</i> deterministic local session</span><span>Bot opponent <i>·</i> no account <i>·</i> no network connection</span></footer>
      </div>
    </main>
  );
}
