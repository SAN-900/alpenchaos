import Link from "next/link";
import { listScenarios } from "@alpenchaos/scenarios";
import { ScenarioCatalog } from "../../components/ScenarioCatalog";

export const metadata = { title: "Scenarios · AlpenChaos" };

export default function Scenarios() {
  const scenarios = listScenarios().map((s) => ({
    id: s.id,
    name: s.name,
    tagline: s.tagline,
    description: s.description,
    difficulty: s.difficulty,
    tags: s.tags,
    mode: s.mode,
    durationMs: s.durationMs,
  }));
  return (
    <main className="page rise catalog-page">
      <header className="head">
        <p className="eyebrow">THE SCENARIO LIBRARY</p>
        <h1>Pick a failure mode.</h1>
        <p className="tagline">Every run is deterministic and replayable. Explore protocol behavior under the same simulated conditions.</p>
      </header>
      <div className="catalog-note"><span className="catalog-note-mark">✳</span><p><strong>Today&apos;s featured run</strong><br />Start here for a guided look at the network.</p><Link href={`/watch/${listScenarios()[0]?.id ?? "baseline"}`}>Open featured scenario <span>↗</span></Link></div>
      <ScenarioCatalog scenarios={scenarios} />
    </main>
  );
}
