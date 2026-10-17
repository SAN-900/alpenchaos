import type { TbValidator, TowerEntry } from "./types";

/** True if `anc` is `desc` or one of its ancestors, according to the known blocks. */
export function isAncestor(blocks: Record<string, number>, anc: number, desc: number): boolean {
  let cur = desc;
  while (cur > anc) {
    const p = blocks[String(cur)];
    if (p === undefined) return false;
    cur = p;
  }
  return cur === anc;
}

/** Visit slot and its known ancestors, newest first. Stop when `fn` returns false. */
export function walkChain(blocks: Record<string, number>, from: number, fn: (slot: number) => boolean): void {
  let cur = from;
  while (cur >= 0) {
    if (!fn(cur)) return;
    const p = blocks[String(cur)];
    if (p === undefined) return;
    cur = p;
  }
}

/**
 * Tower BFT voting rule (simplified):
 *  - votes must be on strictly increasing slots;
 *  - entries whose lockout (2^confirmations slots) has expired are popped;
 *  - the new slot must descend from every remaining entry, else the validator
 *    is locked out and does not vote;
 *  - confirmations = depth in the stack, so lockouts double with depth;
 *  - when the stack exceeds `maxHistory`, the bottom entry is rooted.
 * Mutates `pv` only if the vote is cast. Returns true if voted.
 */
export function tryVote(pv: TbValidator, slot: number, maxHistory: number): boolean {
  if (slot <= pv.lastVote) return false;
  const next: TowerEntry[] = pv.tower.map((e) => ({ ...e }));
  while (next.length > 0) {
    const top = next[next.length - 1]!;
    if (top.slot + 2 ** top.conf < slot) next.pop();
    else break;
  }
  for (const e of next) if (!isAncestor(pv.blocks, e.slot, slot)) return false;
  next.push({ slot, conf: 1 });
  const recompute = () => next.forEach((e, i) => (e.conf = next.length - i));
  recompute();
  if (next.length > maxHistory) {
    pv.root = next.shift()!.slot;
    recompute();
  }
  pv.tower = next;
  pv.lastVote = slot;
  return true;
}
