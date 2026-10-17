import type { SimEvent, SimTime } from "@alpenchaos/shared";
import { Heap } from "./heap";

const before = (a: SimEvent, b: SimEvent): boolean =>
  a.time !== b.time ? a.time < b.time : a.seq < b.seq;

/** Event queue ordered by (time, seq). The queue owns `seq`. */
export class EventQueue {
  private heap = new Heap<SimEvent>(before);
  private nextSeq = 0;

  get size(): number {
    return this.heap.size;
  }

  schedule(time: SimTime, target: string, kind: string, payload: unknown = null): SimEvent {
    if (!Number.isInteger(time) || time < 0) {
      throw new RangeError(`EventQueue.schedule: time must be a non-negative integer, got ${time}`);
    }
    const ev: SimEvent = { time, seq: this.nextSeq++, target, kind, payload };
    this.heap.push(ev);
    return ev;
  }

  peek(): SimEvent | undefined {
    return this.heap.peek();
  }

  pop(): SimEvent | undefined {
    return this.heap.pop();
  }

  snapshot(): { nextSeq: number; events: SimEvent[] } {
    return { nextSeq: this.nextSeq, events: structuredClone(this.heap.toArray()) };
  }

  restore(snap: { nextSeq: number; events: SimEvent[] }): void {
    this.heap.clear();
    this.nextSeq = snap.nextSeq;
    for (const ev of structuredClone(snap.events)) this.heap.push(ev);
  }
}
