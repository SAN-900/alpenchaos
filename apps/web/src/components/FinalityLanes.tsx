import { memo } from "react";
import { LANE_SLOTS, type Cell, type Frame, type Lane, type Proto } from "../sim/driver";
import { fmtClock, fmtMs } from "../sim/format";

const N = LANE_SLOTS;

/**
 * Cells live at fixed positions (slot mod N) and a cursor sweeps across them, like an
 * oscilloscope trace. Nothing ever shifts sideways, so there is no strobing at high speed,
 * no layout work, and a cell only re-renders when its own state changes.
 */
function ring(lane: Lane): (Cell | null)[] {
  const out: (Cell | null)[] = new Array<Cell | null>(N).fill(null);
  for (const c of lane.cells) out[c.slot % N] = c;
  return out;
}

type CellProps = {
  proto: Proto;
  slot: number;
  leader: number;
  state: Cell["state"] | "empty";
  path: Cell["path"];
  ghost: boolean;
  now: boolean;
  next: boolean;
  latencyMs: number | undefined;
  at: number | undefined;
};

function title(p: CellProps): string {
  if (p.state === "empty") return "";
  const head = `Slot ${p.slot} · leader v${p.leader}`;
  if (p.state === "pending") return `${head} · waiting for a certificate`;
  if (p.state === "skipped") return `${head} · skipped at ${fmtClock(p.at ?? 0)}${p.ghost ? " · a block was built, then abandoned (ghost bank)" : ""}`;
  return `${head} · finalized in ${fmtMs(p.latencyMs)}${p.proto === "ag" ? (p.path === "slow" ? " · slow path" : " · fast path") : ""}`;
}

const CellView = memo(function CellView(p: CellProps) {
  const cls = ["c", p.state];
  if (p.state === "finalized" && p.path === "slow") cls.push("slow");
  if (p.ghost) cls.push("ghost");
  if (p.now) cls.push("now");
  if (p.next) cls.push("next");
  return <i className={cls.join(" ")} title={title(p)} />;
});

function LaneRow({ name, hint, lane, proto, slot }: { name: string; hint: string; lane: Lane; proto: Proto; slot: number }) {
  const cells = ring(lane);
  const cursor = slot % N;
  const s = lane.stats;
  return (
    <div className={`lane ${proto}`}>
      <div className="lane-head">
        <h3>{name}</h3>
        <span className="hint">{hint}</span>
        <span className="counts">
          {s.finalized} finalized · {s.skipped} skipped{proto === "ag" ? ` · ${s.fast} fast / ${s.slow} slow` : ""}
        </span>
      </div>
      <div className="strip" role="img" aria-label={`${name}: the last ${N} slots`}>
        {cells.map((c, i) => (
          // The state is part of the key so a cell replays its "pop" when it finalizes.
          <CellView
            key={`${i}-${c?.state ?? "empty"}-${c?.slot ?? 0}`}
            proto={proto}
            slot={c?.slot ?? 0}
            leader={c?.leader ?? 0}
            state={c?.state ?? "empty"}
            path={c?.path}
            ghost={c?.state === "skipped" && c.hasBlock}
            now={i === cursor}
            next={i === (cursor + 1) % N}
            latencyMs={c?.latencyMs}
            at={c?.at}
          />
        ))}
      </div>
    </div>
  );
}

/** The same slots, decided by two protocols. */
export function FinalityLanes({ frame }: { frame: Frame }) {
  return (
    <section className="lanes">
      <LaneRow name="Alpenglow" hint="1 round at 80% stake · 2 rounds at 60%" lane={frame.ag} proto="ag" slot={frame.slot} />
      <LaneRow name="Legacy" hint="Tower BFT · lockouts" lane={frame.tb} proto="tb" slot={frame.slot} />
      <ul className="key">
        <li><i className="c finalized" /> final</li>
        <li><i className="c finalized slow" /> final (slow path)</li>
        <li><i className="c pending" /> waiting</li>
        <li><i className="c skipped" /> skipped</li>
        <li><i className="c skipped ghost" /> ghost bank</li>
      </ul>
    </section>
  );
}
