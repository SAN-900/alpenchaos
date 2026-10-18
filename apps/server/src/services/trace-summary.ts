
import type { TraceEntry } from "@alpenchaos/shared";

export const DEFAULT_SAMPLE_LIMIT = 50;
export const MAX_SAMPLE_LIMIT = 500;

export type TraceSummary = {
  totalEvents: number;
  returnedEvents: number;
  truncated: boolean;
  byKind: Record<string, number>;
  sample: TraceEntry[];
};

/** Per-message events are ~99% of a trace and tell a UI almost nothing individually. */
const isNoise = (kind: string) => kind === "net:send";

type Tagged = { e: TraceEntry; i: number };

export class TraceAccumulator {
  total = 0;
  byKind: Record<string, number> = {};
  private seq = 0;
  private important: Tagged[] = [];
  private sends: Tagged[] = [];
  private stride = 1;
  private sendSeen = 0;

  constructor(private limit = DEFAULT_SAMPLE_LIMIT) {}

  add(events: readonly TraceEntry[]): void {
    for (const e of events) {
      this.total++;
      this.byKind[e.kind] = (this.byKind[e.kind] ?? 0) + 1;
      const t = { e, i: this.seq++ };
      if (!isNoise(e.kind)) {
        if (this.important.length < this.limit) this.important.push(t);
      } else if (this.sendSeen++ % this.stride === 0) {
        this.sends.push(t);
        if (this.sends.length > this.limit * 2) {
          this.sends = this.sends.filter((_, k) => k % 2 === 0);
          this.stride *= 2;
        }
      }
    }
  }

    finish(): TraceSummary {
    const room = Math.max(0, this.limit - this.important.length);
    const picked: Tagged[] = [];
    if (room > 0 && this.sends.length > 0) {
      const step = this.sends.length / Math.min(room, this.sends.length);
      for (let k = 0; k < Math.min(room, this.sends.length); k++) picked.push(this.sends[Math.floor(k * step)]!);
    }
    const sample = [...this.important, ...picked].sort((a, b) => a.e.time - b.e.time || a.i - b.i).map((t) => t.e);
    return {
      totalEvents: this.total,
      returnedEvents: sample.length,
      truncated: this.total > sample.length,
      byKind: this.byKind,
      sample,
    };
  }
}

export function summarizeTrace(events: readonly TraceEntry[], limit = DEFAULT_SAMPLE_LIMIT): TraceSummary {
  const acc = new TraceAccumulator(limit);
  acc.add(events);
  return acc.finish();
}
