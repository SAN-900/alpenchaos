"use client";

import type { Scenario } from "@alpenchaos/scenarios";
import Link from "next/link";
import { useEffect } from "react";
import { useSimLoop } from "../hooks/useSimLoop";
import { detectLite, readLitePref } from "../lib/lite";
import { useSim } from "../store/sim";
import { Controls } from "./Controls";
import { Caption, EventLog } from "./EventLog";
import { FinalityLanes } from "./FinalityLanes";
import { NetworkView } from "./NetworkView";
import { Scoreboard } from "./Scoreboard";
import { TxPanel } from "./TxPanel";

/** A scenario playing in the browser, on the same deterministic engine the server uses. */
export function WatchView({ scenario }: { scenario: Scenario }) {
  const load = useSim((s) => s.load);
  const frame = useSim((s) => s.frame);
  const lite = useSim((s) => s.lite);
  useSimLoop();

  // Order matters: decide lite mode first so the driver is built with the right settings.
  useEffect(() => {
    useSim.getState().setLite(readLitePref() ?? detectLite());
  }, []);
  useEffect(() => load(scenario), [scenario, load]);

  return (
    <main className={`page rise${lite ? " lite" : ""}`}>
      <header className="head">
        <Link href="/scenarios" className="back">← Scenarios</Link>
        <h1>{scenario.name}</h1>
        <p className="tagline">{scenario.tagline}</p>
        <details className="more">
          <summary>About this scenario</summary>
          <p>{scenario.description}</p>
        </details>
      </header>

      {!frame ? (
        <p className="hint">Loading simulation…</p>
      ) : (
        <>
          <Scoreboard frame={frame} />
          <FinalityLanes frame={frame} />
          <Caption frame={frame} idle="Press play to start the run." />
          <Controls />
          <div className="duo">
            <NetworkView frame={frame} />
            <TxPanel frame={frame} />
          </div>
          <EventLog frame={frame} />
          {frame.done && (
            <section className="lesson fade">
              <h2>Takeaway</h2>
              <p>{scenario.lesson}</p>
            </section>
          )}
          <p className="fine">Educational simulation of protocol behaviour · seed {scenario.seed} · same seed, same run.</p>
        </>
      )}
    </main>
  );
}
