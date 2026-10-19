import type { Frame } from "../sim/driver";
import { fmtMs, speedup } from "../sim/format";

/** The two numbers the whole project is about, big and quiet. */
export function Scoreboard({ frame }: { frame: Frame }) {
  const x = speedup(frame.ag.stats.medianMs, frame.tb.stats.medianMs);
  return (
    <div className="score">
      <div className="stat ag">
        <span className="label">Alpenglow</span>
        <span className="num">{fmtMs(frame.ag.stats.medianMs)}</span>
        <span className="sub">median finality</span>
      </div>
      <div className={`vs${x !== null ? " on" : ""}`} aria-live="polite">
        {x !== null ? `${x >= 10 ? Math.round(x) : x.toFixed(1)}× faster` : "vs"}
      </div>
      <div className="stat tb">
        <span className="label">Legacy</span>
        <span className="num">{fmtMs(frame.tb.stats.medianMs)}</span>
        <span className="sub">median finality</span>
      </div>
    </div>
  );
}
