import Link from "next/link";
import { dailyScenario, listScenarios } from "@alpenchaos/scenarios";
import type { CSSProperties } from "react";

const TICKS = Array.from({ length: 16 }, (_, i) => i);
const scenarios = listScenarios();
const daily = dailyScenario();

/** Pure CSS: no JavaScript runs for this animation. */
function Race() {
  return (
    <div className="race" aria-hidden="true">
      <div className="race-row ag">
        <span>Alpenglow</span>
        <div className="ticks">
          {TICKS.map((i) => (
            <i key={i} style={{ "--i": i } as CSSProperties} />
          ))}
        </div>
        <b>~200 ms</b>
      </div>
      <div className="race-row tb">
        <span>Legacy</span>
        <div className="ticks">
          {TICKS.map((i) => (
            <i key={i} style={{ "--i": i } as CSSProperties} />
          ))}
        </div>
        <b>~12 s</b>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="home-page rise">
      <section className="home-hero">
        <div className="hero-copy">
          <p className="eyebrow"><span className="live-dot" /> Solana consensus, under pressure</p>
          <h1>Stress-test the network.<br /><span className="soft">See what finality does.</span></h1>
          <p className="lead">A hands-on playground for exploring validator failures, network partitions, transaction delivery, and Alpenglow finality — safely and deterministically.</p>
          <div className="cta">
            <Link href={`/watch/${daily.id}`} className="btn primary">Watch today&apos;s scenario <span aria-hidden="true">↗</span></Link>
            <Link href="/play" className="btn">Start a match <span aria-hidden="true">→</span></Link>
          </div>
          <div className="hero-proof"><span>01 / DETERMINISTIC RUNS</span><span>02 / REAL ENGINE, SIMULATED NETWORK</span></div>
        </div>
        <div className="hero-visual">
          <div className="visual-top"><span>FINALITY LAB</span><span className="status"><i /> SIMULATION LIVE</span></div>
          <div className="visual-orbit orbit-one" /><div className="visual-orbit orbit-two" />
          <div className="visual-core"><span className="core-spark">✳</span><strong>AG</strong><small>CONSENSUS</small></div>
          <div className="orbit-node node-a"><span>v04</span></div><div className="orbit-node node-b"><span>v12</span></div><div className="orbit-node node-c"><span>v08</span></div>
          <div className="visual-bottom"><span>NETWORK HEALTH</span><strong>DISRUPTED <i>↗</i></strong></div>
          <div className="visual-glow" />
        </div>
      </section>

      <section className="home-metrics" aria-label="Simulation features">
        <div><span className="metric-num">2</span><span>protocols compared<br /><small>Alpenglow + Tower BFT</small></span></div>
        <div><span className="metric-num">{String(scenarios.length).padStart(2, "0")}</span><span>repeatable scenarios<br /><small>Every run, same seed</small></span></div>
        <div><span className="metric-num">0</span><span>mainnet impact<br /><small>Fully isolated simulation</small></span></div>
      </section>

      <section className="home-section">
        <header className="section-heading"><div><p className="eyebrow">CHOOSE YOUR EXPERIENCE</p><h2>Explore the lab</h2></div><Link href="/scenarios" className="text-link">All scenarios <span>↗</span></Link></header>
        <div className="experience-grid">
          <Link href={`/watch/${daily.id}`} className="experience-card feature-card">
            <div className="card-icon green">◉</div><span className="card-kicker">SIMULATION / {daily.mode.toUpperCase()}</span>
            <h3>Watch a scenario</h3><p>Follow two consensus protocols through seeded failures, slot by slot, with live network and transaction views.</p>
            <span className="card-action">Open today&apos;s run <b>↗</b></span>
          </Link>
          <Link href="/play" className="experience-card">
            <div className="card-icon amber">⌁</div><span className="card-kicker">SOLO / VS BOT</span>
            <h3>Play the network</h3><p>Take the chaos or defender role. Make moves, manage energy, and change the outcome.</p>
            <span className="card-action">Start a match <b>↗</b></span>
          </Link>
          <Link href="/arena" className="experience-card">
            <div className="card-icon violet">⌘</div><span className="card-kicker">MULTIPLAYER / LIVE</span>
            <h3>Enter the arena</h3><p>Create a room, invite an opponent, or spectate a live match over WebSocket.</p>
            <span className="card-action">Create or join <b>↗</b></span>
          </Link>
        </div>
      </section>

      <section className="home-race">
        <div className="race-heading"><div><p className="eyebrow">ONE NETWORK. TWO RULESETS.</p><h2>Finality, side by side.</h2></div><p>Compare how protocols respond to the same seeded validators, delays, and failures.</p></div>
        <Race />
        <div className="race-foot"><span>ALPENGLOW <i>FAST / SLOW PATH</i></span><span>TOWER BFT <i>LOCKOUTS</i></span><Link href="/guide">How to read this <b>↗</b></Link></div>
      </section>

      <section className="home-bottom-cta">
        <div><p className="eyebrow">START LEARNING</p><h2>What happens when a leader goes offline?</h2><p>Begin with a guided scenario, then try to outplay the network.</p></div>
        <Link href="/scenarios" className="btn primary">Browse scenarios <span aria-hidden="true">↗</span></Link>
      </section>
    </main>
  );
}