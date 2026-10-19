"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type ScenarioSummary = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  difficulty: number;
  tags: string[];
  mode: string;
  durationMs: number;
};

const filters = ["All", "Network", "Validator", "Transactions"] as const;
type Filter = (typeof filters)[number];

function hasCategory(scenario: ScenarioSummary, filter: Filter): boolean {
  if (filter === "All") return true;
  const text = `${scenario.tags.join(" ")} ${scenario.name} ${scenario.description}`.toLowerCase();
  if (filter === "Network") return /partition|network|latency|delay|loss/.test(text);
  if (filter === "Validator") return /validator|leader|stake|crash|offline/.test(text);
  return /transaction|ghost|block|delivery/.test(text);
}

function duration(ms: number): string {
  return ms < 60_000 ? `${Math.round(ms / 1000)} sec` : `${Math.round(ms / 60_000)} min`;
}

export function ScenarioCatalog({ scenarios }: { scenarios: ScenarioSummary[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scenarios.filter((scenario) => {
      const matchesQuery = !q || `${scenario.name} ${scenario.tagline} ${scenario.description} ${scenario.tags.join(" ")}`.toLowerCase().includes(q);
      return matchesQuery && hasCategory(scenario, filter);
    });
  }, [filter, query, scenarios]);

  return (
    <section className="catalog">
      <div className="catalog-tools">
        <label className="search-box">
          <span aria-hidden="true">⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search scenarios..." aria-label="Search scenarios" />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search">×</button>}
        </label>
        <div className="filter-tabs" role="group" aria-label="Filter scenarios">
          {filters.map((item) => <button type="button" key={item} className={item === filter ? "selected" : ""} aria-pressed={item === filter} onClick={() => setFilter(item)}>{item}</button>)}
        </div>
        <span className="catalog-count">{filtered.length} SCENARIO{filtered.length === 1 ? "" : "S"}</span>
      </div>

      {filtered.length ? (
        <ol className="scenario-grid">
          {filtered.map((scenario, index) => (
            <li key={scenario.id}>
              <article className="scenario-card">
                <div className="scenario-meta"><span>{String(index + 1).padStart(2, "0")} / {scenario.mode.toUpperCase()}</span><span className="difficulty" aria-label={`Difficulty ${scenario.difficulty} out of 3`}>{"●".repeat(scenario.difficulty)}<i>{"●".repeat(Math.max(0, 3 - scenario.difficulty))}</i></span></div>
                <h2>{scenario.name}</h2>
                <p className="scenario-tagline">{scenario.tagline}</p>
                <p className="scenario-description">{scenario.description}</p>
                <div className="scenario-tags">{scenario.tags.slice(0, 3).map((tag) => <span key={tag}>{tag.replaceAll("-", " ")}</span>)}<span>{duration(scenario.durationMs)}</span></div>
                <div className="scenario-actions">
                  <Link href={`/watch/${scenario.id}`} className="btn primary">Watch run <span>↗</span></Link>
                  {scenario.mode === "play" && <Link href="/play" className="btn">Play scenario</Link>}
                </div>
              </article>
            </li>
          ))}
        </ol>
      ) : <div className="empty-state"><span>⌕</span><h2>No scenarios found</h2><p>Try another search or select a different filter.</p><button className="text-link" onClick={() => { setQuery(""); setFilter("All"); }}>Clear filters ↗</button></div>}
    </section>
  );
}
