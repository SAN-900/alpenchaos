import Link from "next/link";

export const metadata = {
  title: "Guide & API · AlpenChaos",
  description: "How to use the AlpenChaos simulator and its HTTP and WebSocket APIs.",
};

const endpoints = [
  ["GET", "/health", "Service health and timestamp."],
  ["GET", "/scenarios", "List scenario summaries."],
  ["GET", "/scenarios/daily", "Get today’s UTC scenario."],
  ["GET", "/scenarios/:id", "Fetch scenario detail, annotations, and objectives."],
  ["POST", "/sessions", "Create an HTTP simulation session with { scenarioId }."],
  ["GET", "/sessions/:id", "Read current clock, validator, consensus, and game state."],
  ["POST", "/sessions/:id/advance", "Advance a watch session by a duration."],
  ["POST", "/sessions/:id/actions", "Apply a play-mode action for a role."],
  ["DELETE", "/sessions/:id", "Delete an HTTP simulation session."],
  ["POST", "/rooms", "Create a multiplayer room for a play-mode scenario."],
  ["GET", "/rooms/:id", "Inspect room status, seats, spectators, and clock."],
  ["GET", "/leaderboard/:scenarioId?role=chaos", "List match scores for a scenario and role."],
  ["GET", "/replays/:id", "Fetch a completed match and its action log."],
] as const;

export default function GuidePage() {
  return (
    <main className="page doc-page rise">
      <header className="doc-hero compact">
        <p className="eyebrow">FIELD GUIDE / V1</p>
        <h1>How to use the lab.</h1>
        <p className="lead">A quick tour of the simulation, controls, and the server API powering online play.</p>
      </header>

      <nav className="guide-toc" aria-label="Guide sections"><a href="#watch">01 / Watch mode</a><a href="#play">02 / Play mode</a><a href="#reading">03 / Reading results</a><a href="#api">04 / HTTP API</a><a href="#realtime">05 / Realtime</a></nav>

      <section className="guide-section" id="watch"><span className="doc-feature-index">01 / WATCH MODE</span><div><h2>Follow a seeded run.</h2><p>Choose a scenario and press play. The control dock supports pause, playback speed, and seeking. Seeking re-simulates from time zero, so the displayed run remains deterministic. Lite mode disables message tracing and animation to reduce work on slower devices.</p><p>The finality lanes compare the same slot range. Green marks Alpenglow finality, gray marks Tower BFT finality, outlined cells are skipped slots, and dashed outlines indicate a ghost bank (a produced block that was later abandoned). Transaction rows show each scripted transaction&apos;s fate under both protocols.</p><Link className="text-link" href="/scenarios">Browse scenarios ↗</Link></div></section>
      <section className="guide-section" id="play"><span className="doc-feature-index">02 / PLAY MODE</span><div><h2>Choose a side and change the conditions.</h2><p>Solo mode runs in your browser against a lightweight local bot. Chaos actions disrupt production; defender actions restore validators, repair partitions, or submit transactions. Select a validator before using validator-specific actions. Energy regenerates over simulated time and actions are rejected if they cannot be afforded.</p><p>Online arena matches use server-authoritative rooms. A room can be joined as Chaos, Defender, or spectator. The match begins when both player seats are present.</p><Link className="text-link" href="/arena">Open the online arena ↗</Link></div></section>
      <section className="guide-section" id="reading"><span className="doc-feature-index">03 / RESULTS</span><div><h2>Compare outcomes, not just speed.</h2><p>Median finality is calculated from slots finalized so far. Alpenglow shows its fast and slow paths separately; Tower BFT uses lockouts. A protocol may finalize a slot later, skip it, or be unable to deliver a transaction in an abandoned block. Scenarios include a takeaway describing the behavior they are designed to illustrate.</p><p>All timing and protocol behavior is a simplified educational model, not a mainnet guarantee.</p></div></section>

      <section className="api-section" id="api">
        <div className="api-heading"><span className="doc-feature-index">04 / HTTP API</span><h2>Server endpoints.</h2><p>Base URL defaults to <code>http://localhost:3001</code>. Set <code>NEXT_PUBLIC_API_URL</code> in the web app environment to use another server.</p></div>
        <div className="endpoint-list">{endpoints.map(([method, path, description]) => <div className="endpoint" key={`${method}-${path}`}><span className={`method method-${method.toLowerCase()}`}>{method}</span><code>{path}</code><p>{description}</p></div>)}</div>
      </section>

      <section className="guide-section" id="realtime"><span className="doc-feature-index">05 / REALTIME</span><div><h2>WebSocket match protocol.</h2><p>Connect to <code>ws://localhost:3001/ws/match</code> (or <code>wss://</code> for a secure deployment). Send JSON messages with a <code>t</code> field: <code>join</code> with a room, optional role/name/token; <code>start</code> to begin a lobby; <code>action</code> with an action object; or <code>ping</code> to keep the connection alive.</p><p>Server events include <code>joined</code>, <code>presence</code>, <code>started</code>, <code>tick</code>, <code>feed</code>, <code>actionResult</code>, <code>over</code>, and <code>error</code>. A reconnecting player should reuse the seat token returned by <code>joined</code>.</p></div></section>
      <div className="doc-footnote"><span>Have a question?</span><Link href="/about">Read about the project <b>↗</b></Link></div>
    </main>
  );
}
