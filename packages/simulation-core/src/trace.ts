import type { TraceEntry } from "@alpenchaos/shared";

/** Append-only log of what happened. Separate from world state. */
export class TraceRecorder {
  entries: TraceEntry[] = [];

  record(entry: TraceEntry): void {
    this.entries.push(entry);
  }

  /** Return everything recorded so far and clear. UI calls this per frame. */
  drain(): TraceEntry[] {
    const out = this.entries;
    this.entries = [];
    return out;
  }
}
