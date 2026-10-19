"use client";

import { useEffect, useState } from "react";
import { writeLitePref } from "../lib/lite";
import { fmtClock } from "../sim/format";
import { SPEEDS, useSim } from "../store/sim";

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path d={d} fill="currentColor" />
  </svg>
);
const PLAY = "M8 5v14l11-7z";
const PAUSE = "M7 5h4v14H7zM13 5h4v14h-4z";
const REPLAY = "M12 5V1L7 6l5 5V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z";

/** A small floating dock: play/pause, scrubber, speed, lite mode. */
export function Controls() {
  const frame = useSim((s) => s.frame);
  const playing = useSim((s) => s.playing);
  const speed = useSim((s) => s.speed);
  const lite = useSim((s) => s.lite);
  const driver = useSim((s) => s.driver);
  const { toggle, setSpeed, setLite, seek } = useSim.getState();

  // While dragging, show the thumb where the user put it; only seek when they let go.
  const [drag, setDrag] = useState<number | null>(null);
  useEffect(() => setDrag(null), [driver]);

  if (!frame || !driver) return null;
  const value = drag ?? frame.now;
  const commit = () => {
    if (drag !== null) seek(drag);
    setDrag(null);
  };
  const label = frame.done ? "Replay" : playing ? "Pause" : "Play";

  return (
    <div className="dock">
      <button type="button" className="icon primary" onClick={toggle} aria-label={label} title={label}>
        <Icon d={frame.done ? REPLAY : playing ? PAUSE : PLAY} />
      </button>

      <input
        className="scrub"
        type="range"
        min={0}
        max={driver.durationMs}
        step={driver.slotMs}
        value={value}
        onChange={(e) => setDrag(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        aria-label="Simulated time"
      />
      <span className="clock">{fmtClock(value)}</span>

      <div className="seg" role="group" aria-label="Speed">
        {SPEEDS.map((x) => (
          <button key={x} type="button" className={x === speed ? "on" : ""} onClick={() => setSpeed(x)} aria-pressed={x === speed}>
            {x}×
          </button>
        ))}
      </div>

      <button
        type="button"
        className={`chip-btn${lite ? " on" : ""}`}
        aria-pressed={lite}
        title="Lite mode: fewer frames, no animation, no message dots. Easier on slow devices and batteries."
        onClick={() => {
          writeLitePref(!lite);
          setLite(!lite);
        }}
      >
        Lite
      </button>
    </div>
  );
}
