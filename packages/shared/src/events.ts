/** Simulated time in integer milliseconds. Never fractional. */
export type SimTime = number;

/**
 * A timed event. `seq` is assigned by the queue (never by callers) and breaks
 * ties between events that share a timestamp, so ordering is deterministic.
 * `payload` must be plain JSON-like data (no functions, no class instances)
 * so that snapshots stay serializable.
 */
export type SimEvent<P = unknown> = {
  time: SimTime;
  seq: number;
  /** Validator id, or "world" for global events. */
  target: string;
  kind: string;
  payload: P;
};
