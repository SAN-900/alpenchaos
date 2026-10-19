import Link from "next/link";

export const metadata = {
  title: "About · AlpenChaos",
  description: "About the AlpenChaos deterministic consensus and network simulation lab.",
};

export default function AboutPage() {
  return (
    <main className="page doc-page rise">
      <header className="doc-hero">
        <p className="eyebrow">ABOUT THE PROJECT</p>
        <h1>Make consensus<br /><span className="soft">feel tangible.</span></h1>
        <p className="lead">AlpenChaos is an educational lab for exploring how consensus behaves when the network doesn&apos;t cooperate.</p>
      </header>

      <section className="doc-feature">
        <div className="doc-feature-index">01 / PURPOSE</div>
        <div><h2>A safe place to break things.</h2><p>Validators go offline. Messages arrive late or never. Leaders miss their turn. AlpenChaos makes those conditions visible in a deterministic simulation, so you can observe the consequences without touching a live blockchain.</p><p>Each scenario feeds the same seeded network conditions into Alpenglow and Tower BFT. Their finality lanes, transaction outcomes, and network messages can then be compared directly.</p></div>
      </section>
      <section className="doc-feature">
        <div className="doc-feature-index">02 / MODEL</div>
        <div><h2>One engine, multiple ways to explore.</h2><p>The shared TypeScript engine models validators, stake, network delay, partitions, packet loss, blocks, votes, and protocol state. Browser simulations are deterministic: the same scenario seed produces the same sequence of events, which makes scrubbing and replay possible.</p><p>Watch mode is a guided comparison. Solo play adds role-based actions and a local opponent. The online arena uses authoritative server sessions for live matches.</p></div>
      </section>
      <section className="doc-feature">
        <div className="doc-feature-index">03 / SCOPE</div>
        <div><h2>Educational, not a prediction.</h2><p>This is a simplified model for learning and experimentation, not a complete implementation or performance benchmark of either protocol. Timing figures are model outputs; they should not be read as guarantees about mainnet behavior.</p><p>No wallet, private key, token, or mainnet connection is required. Actions affect only the local simulation or AlpenChaos match server.</p></div>
      </section>

      <div className="doc-cta"><div><p className="eyebrow">GO DEEPER</p><h2>Read the field guide.</h2><p>Learn the interface, controls, model assumptions, and API surface.</p></div><Link className="btn primary" href="/guide">Open guide & API docs <span>↗</span></Link></div>
    </main>
  );
}
