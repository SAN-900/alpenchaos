import type { SimEvent, SimTime, TraceEntry } from "@alpenchaos/shared";
import { EventQueue } from "./queue";
import { Rng } from "./rng";
import { TraceRecorder } from "./trace";

/** What event handlers are allowed to touch. No wall clock, no Math.random. */
export type Ctx = {
  readonly now: SimTime;
  readonly rng: Rng;
  /** Schedule an event `delay` ms from now (integer >= 0). */
  schedule(delay: number, target: string, kind: string, payload?: unknown): void;
  trace(entry: TraceEntry): void;
};

export type Dispatch<S> = (state: S, ev: SimEvent, ctx: Ctx) => void;

export type Snapshot<S> = {
  now: SimTime;
  rng: number;
  queue: { nextSeq: number; events: SimEvent[] };
  state: S;
};

export type RunResult = {
  processed: number;
  /** false if stopped early by maxEvents; remaining events stay queued. */
  reachedTarget: boolean;
};

/**
 * Event-driven engine. Simulated time only jumps forward to the next event.
 * World state `S` must be plain serializable data (no class instances with
 * methods, no functions) so snapshot/restore works.
 */
export class Engine<S> {
  now: SimTime = 0;
  readonly queue = new EventQueue();
  readonly rng: Rng;
  readonly trace = new TraceRecorder();
  state: S;

  private readonly ctx: Ctx;

  constructor(state: S, private dispatch: Dispatch<S>, seed: number) {
    this.state = state;
    this.rng = new Rng(seed);
    const self = this;
    this.ctx = {
      get now() {
        return self.now;
      },
      rng: this.rng,
      schedule: (delay, target, kind, payload) => self.schedule(delay, target, kind, payload),
      trace: (entry) => self.trace.record(entry),
    };
  }

  /** Schedule relative to the current simulated time. Also used for injecting
   *  player actions and faults between frames. */
  schedule(delay: number, target: string, kind: string, payload?: unknown): void {
    if (!Number.isInteger(delay) || delay < 0) {
      throw new RangeError(`Engine.schedule: delay must be an integer >= 0, got ${delay}`);
    }
    this.queue.schedule(this.now + delay, target, kind, payload);
  }

  /**
   * Process all events with time <= t. If maxEvents is hit first, `now` stays
   * at the last processed event so the next call continues where this stopped.
   */
  runUntil(t: SimTime, maxEvents = 100_000): RunResult {
    if (!Number.isInteger(t)) throw new RangeError(`Engine.runUntil: t must be an integer, got ${t}`);
    let processed = 0;
    while (processed < maxEvents) {
      const ev = this.queue.peek();
      if (!ev || ev.time > t) {
        if (t > this.now) this.now = t;
        return { processed, reachedTarget: true };
      }
      this.queue.pop();
      this.now = ev.time;
      this.dispatch(this.state, ev, this.ctx);
      processed++;
    }
    return { processed, reachedTarget: false };
  }

  snapshot(): Snapshot<S> {
    return {
      now: this.now,
      rng: this.rng.getState(),
      queue: this.queue.snapshot(),
      state: structuredClone(this.state),
    };
  }

  restore(snap: Snapshot<S>): void {
    this.now = snap.now;
    this.rng.setState(snap.rng);
    this.queue.restore(snap.queue);
    this.state = structuredClone(snap.state);
  }
}
