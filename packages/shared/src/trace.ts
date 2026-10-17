import type { SimTime } from "./events";

/** One thing that happened, for the UI to animate. Kept out of world state. */
export type TraceEntry = {
  time: SimTime;
  kind: string;
  [key: string]: unknown;
};
