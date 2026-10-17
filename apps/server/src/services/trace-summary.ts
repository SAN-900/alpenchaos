
import type { TraceEntry } from "@alpenchaos/shared";

const SAMPLE_LIMIT = 50;

export type TraceSummary = {
  totalEvents: number;
  returnedEvents: number;
  truncated: boolean;
  byKind: Record<string, number>;
  sample: TraceEntry[];
};

export function summarizeTrace(events: TraceEntry[]): TraceSummary {
  const byKind: Record<string, number> = {};

  for (const event of events) {
    byKind[event.kind] = (byKind[event.kind] ?? 0) + 1;
  }

  const sample = events.slice(0, SAMPLE_LIMIT);

  return {
    totalEvents: events.length,
    returnedEvents: sample.length,
    truncated: events.length > SAMPLE_LIMIT,
    byKind,
    sample,
  };
}
