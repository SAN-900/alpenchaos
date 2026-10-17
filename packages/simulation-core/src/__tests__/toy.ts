import type { Dispatch } from "../engine";

export type ToyState = { count: number };

/** Each ping spawns 0-3 children with small random delays (incl. 0), so many
 *  events share timestamps. Exercises ordering and RNG draw order. */
export const toyDispatch: Dispatch<ToyState> = (state, ev, ctx) => {
  const depth = (ev.payload as { depth: number }).depth;
  state.count++;
  ctx.trace({ time: ctx.now, kind: "ping", target: ev.target, depth });
  if (depth >= 8) return;
  const children = ctx.rng.int(0, 4);
  for (let i = 0; i < children; i++) {
    ctx.schedule(ctx.rng.int(0, 4), `v${ctx.rng.int(0, 5)}`, "ping", { depth: depth + 1 });
  }
};
