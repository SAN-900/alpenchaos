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
    <main className="min-h-[calc(100vh-64px)] bg-[#08090b] px-4 pb-28 pt-8 text-zinc-100 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col justify-between gap-4 border-b border-white/10 pb-6 md:flex-row md:items-end">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-lime-300"><span className="h-2 w-2 animate-pulse rounded-full bg-lime-300" /> Local simulation · no server required</div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Play the network.</h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">Attack consensus or defend finality. Every action changes the same deterministic Solana network model used by AlpenChaos.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => onRoleChange(role === "chaos" ? "defender" : "chaos")} className="rounded-xl border border-white/15 px-4 py-2 text-sm text-zinc-300 transition hover:border-lime-300/50 hover:text-lime-200">Switch side</button>
            <button onClick={game.togglePlaying} disabled={Boolean(currentGame?.over)} className="rounded-xl border border-white/15 px-4 py-2 text-sm text-zinc-300 transition hover:border-sky-300/50 disabled:opacity-40">{game.playing ? "Pause" : "Resume"}</button>
            <button onClick={onRestart} className="rounded-xl bg-lime-300 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-lime-200">Restart match ↻</button>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:col-span-1">
            <p className="text-xs uppercase tracking-widest text-zinc-500">You play as</p>
            <div className="mt-2 flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${role === "chaos" ? "bg-rose-400" : "bg-lime-300"}`} /><span className="text-xl font-semibold">{role === "chaos" ? "Chaos" : "Defender"}</span></div>
            <p className="mt-2 text-sm text-zinc-400">{role === "chaos" ? "Disrupt the network. Win by stalling finality or outscoring the defender." : "Keep the chain moving. Recover validators and land transactions."}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
            <p className="text-xs uppercase tracking-widest text-zinc-500">Your score</p><p className="mt-1 text-3xl font-semibold tabular-nums">{human?.score ?? 0}</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-lime-300 transition-all" style={{ width: `${Math.min(100, (human?.score ?? 0) / 150 * 100)}%` }} /></div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
            <p className="text-xs uppercase tracking-widest text-zinc-500">Energy</p><div className="mt-1 flex items-baseline gap-2"><span className="text-3xl font-semibold tabular-nums">{energy.toFixed(1)}</span><span className="text-sm text-zinc-500">/ 10</span></div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-sky-300 transition-all" style={{ width: `${energy * 10}%` }} /></div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(300px,0.9fr)]">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0d0f12]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div><h2 className="font-semibold">Validator network</h2><p className="mt-1 text-xs text-zinc-500">{validators.length} validators · slot {Math.floor(now / (currentGame?.cfg.slotMs ?? 400))} · leader v{leaderIndex}</p></div>
              <span className={`rounded-full px-3 py-1 text-xs ${currentGame?.over ? "bg-white/10 text-zinc-300" : game.playing ? "bg-lime-300/10 text-lime-200" : "bg-amber-300/10 text-amber-200"}`}>{currentGame?.over ? "MATCH COMPLETE" : game.playing ? "LIVE" : "PAUSED"}</span>
            </div>
            <div className="grid grid-cols-4 gap-2 p-4 sm:grid-cols-6 md:grid-cols-8">
              {validators.map((v, i) => {
                const isLeader = i === leaderIndex;
                const group = net?.group[i] ?? 0;
                return <button key={v.id} onClick={() => game.setSelectedValidator(i)} title={`${v.id} · ${v.up ? "online" : "offline"} · group ${group}`} className={`relative rounded-xl border px-1 py-3 text-center transition hover:-translate-y-0.5 ${selected === i ? "border-sky-300 bg-sky-300/10" : isLeader ? "border-lime-300/70 bg-lime-300/[0.08]" : "border-white/10 bg-white/[0.025]"}`}>
                  {isLeader && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 animate-ping rounded-full bg-lime-300" />}
                  <span className={`mx-auto mb-2 block h-2 w-2 rounded-full ${!v.up ? "bg-rose-400" : group !== 0 ? "bg-amber-300" : "bg-lime-300"}`} />
                  <span className="block text-xs font-medium">{v.id}</span><span className="mt-1 block text-[10px] text-zinc-500">{v.up ? `${Math.round((v.stake / (net?.totalStake || 1)) * 100)}%` : "DOWN"}</span>
                </button>;
              })}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-white/10 px-5 py-3 text-xs text-zinc-500"><span><i className="mr-2 inline-block h-2 w-2 rounded-full bg-lime-300" />Online</span><span><i className="mr-2 inline-block h-2 w-2 rounded-full bg-amber-300" />Partitioned</span><span><i className="mr-2 inline-block h-2 w-2 rounded-full bg-rose-400" />Offline</span><span><i className="mr-2 inline-block h-2 w-2 rounded-full bg-sky-300" />Selected</span></div>
          </div>

          <aside className="rounded-2xl border border-white/10 bg-[#0d0f12] p-5">
            <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">Action deck</h2><p className="mt-1 text-xs text-zinc-500">Choose a move for your side</p></div><span className="rounded-md bg-white/5 px-2 py-1 text-xs text-zinc-400">{role.toUpperCase()}</span></div>
            <div className="mt-4 space-y-2">
              {actionList.map((item) => <button key={item.label} onClick={() => doAction(item.action)} disabled={!game.playing || Boolean(currentGame?.over)} className="group w-full rounded-xl border border-white/10 bg-white/[0.025] p-3 text-left transition hover:border-lime-300/50 hover:bg-lime-300/[0.04] disabled:cursor-not-allowed disabled:opacity-40"><span className="block text-sm font-medium text-zinc-100 group-hover:text-lime-200">{item.label} <span className="float-right text-zinc-500">↗</span></span><span className="mt-1 block text-xs leading-relaxed text-zinc-500">{item.detail.replace("selected validator", `selected ${validators[selected]?.id ?? "validator"}`)}</span></button>)}
            </div>
            <p aria-live="polite" className="mt-4 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-400">{game.message}</p>
          </aside>
        </section>

        <section className="grid gap-5 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
            <div className="flex items-center justify-between"><h2 className="font-semibold">Scoreboard</h2><span className="font-mono text-xs text-zinc-500">{fmt(now)} / {fmt(currentGame?.cfg.durationMs ?? 60_000)}</span></div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-sky-300 transition-all" style={{ width: `${progress}%` }} /></div>
            <div className="mt-4 grid grid-cols-2 gap-3"><div className={`rounded-xl border p-3 ${role === "chaos" ? "border-rose-300/30 bg-rose-300/[0.05]" : "border-white/10"}`}><p className="text-xs text-zinc-500">Chaos</p><p className="mt-1 text-2xl font-semibold">{currentGame?.players.chaos.score ?? 0}</p><p className="mt-1 text-xs text-zinc-500">{chaosEnergy.toFixed(1)} energy</p></div><div className={`rounded-xl border p-3 ${role === "defender" ? "border-lime-300/30 bg-lime-300/[0.05]" : "border-white/10"}`}><p className="text-xs text-zinc-500">Defender</p><p className="mt-1 text-2xl font-semibold">{currentGame?.players.defender.score ?? 0}</p><p className="mt-1 text-xs text-zinc-500">{defenderEnergy.toFixed(1)} energy</p></div></div>
            {currentGame?.over && <div className="mt-4 rounded-xl border border-lime-300/20 bg-lime-300/[0.06] p-4"><p className="text-xs font-semibold uppercase tracking-widest text-lime-200">{currentGame.over.winner === role ? "You won" : "Bot won"}</p><p className="mt-1 text-sm text-zinc-300">{currentGame.over.reason}</p><button onClick={onRestart} className="mt-3 rounded-lg bg-lime-300 px-3 py-2 text-sm font-semibold text-zinc-950">Play again</button></div>}
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"><div className="flex items-center justify-between"><h2 className="font-semibold">Match feed</h2><span className="text-xs text-zinc-500">Latest events</span></div><ol className="mt-4 max-h-60 space-y-3 overflow-auto">{[...(currentGame?.feed ?? [])].slice(-12).reverse().map((event, i) => <li key={`${event.t}-${event.text}-${i}`} className="flex gap-3 text-sm"><span className="w-12 shrink-0 font-mono text-xs text-zinc-600">{fmt(event.t)}</span><span className="text-zinc-300">{event.text}</span></li>)}{!currentGame?.feed.length && <li className="text-sm text-zinc-500">Events will appear as the match evolves.</li>}</ol></div>
        </section>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4 text-xs text-zinc-600"><span>{scenario.name} · seed {scenario.seed} · deterministic local session</span><span>Bot opponent · no account · no network connection</span></footer>
      </div>
    </main>
  );
}
