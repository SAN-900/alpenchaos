/**
 * A fault is data: "at this simulated time, send this event to the world".
 * Scripts (scenarios, player actions, scheduled attacks) are just arrays of
 * these, so they can be saved, replayed, merged and shared as replay links.
 */
export type FaultEvent = { at: number; kind: string; payload?: unknown; label?: string };
export type FaultScript = FaultEvent[];

/** The slice of Engine that injection needs. Engine<S> satisfies it. */
export interface Schedulable {
  readonly now: number;
  schedule(delay: number, target: string, kind: string, payload?: unknown): void;
}

/** Merge scripts, ordered by time; events with equal time keep their given order. */
export function mergeScripts(...scripts: FaultScript[]): FaultScript {
  return scripts.flat().sort((a, b) => a.at - b.at);
}

/**
 * Schedule every event on the engine at its absolute time. Throws if an event
 * is in the past. Inject BEFORE the WORLD_START event if a fault must land
 * ahead of the slot clocks at the same timestamp (same-time events run in
 * scheduling order).
 */
export function injectFaults(engine: Schedulable, script: FaultScript): void {
  for (const e of mergeScripts(script)) {
    if (!Number.isInteger(e.at) || e.at < engine.now) {
      throw new RangeError(`injectFaults: event "${e.kind}" at ${e.at} is invalid (now = ${engine.now})`);
    }
    engine.schedule(e.at - engine.now, "world", e.kind, e.payload ?? {});
  }
}
