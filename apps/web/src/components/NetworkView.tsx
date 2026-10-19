import type { Frame } from "../sim/driver";

const SIZE = 320;
const C = SIZE / 2;
const RING = 118;
/** Hard cap so a burst of traffic can never flood the DOM. */
const MAX_DOTS = 70;

function pos(i: number, n: number): { x: number; y: number } {
  const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
  return { x: C + RING * Math.cos(a), y: C + RING * Math.sin(a) };
}

/** Validators on a ring, sized by stake. Hollow = crashed, dashed = lagging, orange = cut off. */
export function NetworkView({ frame }: { frame: Frame }) {
  const n = frame.validators.length;
  const p = Array.from({ length: n }, (_, i) => pos(i, n));
  const dots = frame.dots.length > MAX_DOTS ? frame.dots.slice(0, MAX_DOTS) : frame.dots;

  return (
    <section className="block">
      <header className="block-head">
        <h2>Network</h2>
        <span className="hint">slot {frame.slot} · leader v{frame.leader}</span>
      </header>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="net" role="img" aria-label="Validator network">
        {dots.map((d, i) => {
          const a = p[d.from];
          const b = p[d.to];
          if (!a || !b) return null;
          const t = Math.min(1, Math.max(0, (frame.now - d.sentAt) / Math.max(1, d.arriveAt - d.sentAt)));
          const block = d.kind.endsWith(":block");
          return <circle key={i} cx={a.x + (b.x - a.x) * t} cy={a.y + (b.y - a.y) * t} r={block ? 3.2 : 1.6} className={`dot ${d.proto}${block ? " block" : ""}`} />;
        })}
        {frame.validators.map((v, i) => {
          const q = p[i]!;
          const r = 4 + Math.sqrt(v.stakePct) * 2.6;
          const cls = ["node", v.up ? "up" : "down", v.group !== 0 ? "cut" : "", v.extraDelayMs > 0 ? "lag" : ""].filter(Boolean).join(" ");
          return (
            <g key={v.id}>
              {i === frame.leader && <circle cx={q.x} cy={q.y} r={r + 4} className="leader" />}
              <circle cx={q.x} cy={q.y} r={r} className={cls}>
                <title>{`${v.id} · ${v.stakePct}% stake${v.up ? "" : " · crashed"}${v.group !== 0 ? " · cut off" : ""}${v.extraDelayMs ? ` · +${v.extraDelayMs} ms` : ""}`}</title>
              </circle>
            </g>
          );
        })}
      </svg>
    </section>
  );
}
