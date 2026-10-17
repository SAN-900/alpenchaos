import type { Protocol, ProtocolEnv, ProtocolMessage } from "@alpenchaos/shared";
import { tryVote, walkChain } from "./tower";
import type { TbConfig, TbValidator, TowerBftState } from "./types";

export const DEFAULT_TB_CONFIG: TbConfig = { slotMs: 400, superNum: 2, superDen: 3, maxLockoutHistory: 31 };

const KEEP_SLOTS = 150;

const newValidator = (): TbValidator => ({
  blocks: {},
  tower: [],
  root: -1,
  lastVote: -1,
  voters: {},
  rootVoters: {},
});

function addVoter(list: number[], from: number): boolean {
  if (list.includes(from)) return false;
  list.push(from);
  return true;
}

function markFinalized(st: TowerBftState, v: number, slot: number, env: ProtocolEnv): void {
  let cur = slot;
  while (cur >= 0) {
    if (st.global[String(cur)]) break; // this ancestor (and its gaps) already settled
    const lat = env.now - cur * st.cfg.slotMs;
    st.global[String(cur)] = { status: "finalized", at: env.now, by: v, latencyMs: lat };
    env.emit({ kind: "finalized", slot: cur, by: v, latencyMs: lat });
    const parent = st.vals[v]!.blocks[String(cur)];
    if (parent === undefined) break;
    for (let g = cur - 1; g > parent; g--) {
      if (st.global[String(g)]) continue;
      const gl = env.now - g * st.cfg.slotMs;
      st.global[String(g)] = { status: "skipped", at: env.now, by: v, latencyMs: gl };
      env.emit({ kind: "skipped", slot: g, by: v, latencyMs: gl });
    }
    cur = parent;
  }
}

/**
 * Simplified legacy (Tower BFT) finality for comparison with Alpenglow.
 * Modelled: a chain of blocks with parent pointers (leaders build on the
 * newest block they know); votes with doubling lockouts; rooting at tower
 * depth 32; "finalized" = >= 2/3 of stake have rooted the slot; skipped slots
 * are only learned when a descendant finalizes; "optimistic confirmation" =
 * >= 2/3 stake voted on the slot or a descendant.
 * Not modelled: fork choice weights, switch proofs, vote-transaction fees,
 * gossip vs. TPU paths, repair, equivocation.
 */
export function createTowerBft(cfg: Partial<TbConfig> = {}): Protocol<TowerBftState> {
  const config: TbConfig = { ...DEFAULT_TB_CONFIG, ...cfg };

  return {
    name: "tb",

    init: (n) => ({
      cfg: { ...config },
      cur: new Array<number>(n).fill(-1),
      vals: Array.from({ length: n }, newValidator),
      global: {},
      optimistic: {},
    }),

    start(_st, env) {
      for (let v = 0; v < env.validators; v++) env.setTimer(v, 0, "slot", { slot: 0 });
    },

    onTimer(st, v, kind, body, env) {
      if (kind !== "slot") return;
      const slot = (body as { slot: number }).slot;
      env.setTimer(v, st.cfg.slotMs, "slot", { slot: slot + 1 }); // clock chain survives crashes
      if (!env.isUp(v)) return;
      st.cur[v] = slot;
      const pv = st.vals[v]!;
      for (const m of [pv.blocks, pv.voters, pv.rootVoters]) {
        for (const k of Object.keys(m)) if (Number(k) < slot - KEEP_SLOTS) delete m[k];
      }
      if (env.leaderForSlot(slot) === v) {
        let parent = -1;
        for (const k of Object.keys(pv.blocks)) parent = Math.max(parent, Number(k));
        env.emit({ kind: "block", slot, leader: v, parent });
        env.broadcast(v, "block", { slot, parent }, true);
      }
    },

    onMessage(st, to, msg: ProtocolMessage, env) {
      const pv = st.vals[to]!;
      const body = msg.body as { slot: number; parent?: number; root?: number };

      if (msg.kind === "block") {
        if (msg.from !== env.leaderForSlot(body.slot)) return;
        if (pv.blocks[String(body.slot)] !== undefined) return;
        pv.blocks[String(body.slot)] = body.parent ?? -1;
        if (tryVote(pv, body.slot, st.cfg.maxLockoutHistory)) {
          env.broadcast(to, "vote", { slot: body.slot, root: pv.root }, true);
        }
        return;
      }

      if (msg.kind === "vote") {
        // Votes confirm the slot and all its known ancestors.
        walkChain(pv.blocks, body.slot, (a) => {
          const list = (pv.voters[String(a)] ??= []);
          if (!addVoter(list, msg.from)) return false; // already counted this voter here and below
          if (!st.optimistic[String(a)] && env.stakeThreshold(list, st.cfg.superNum, st.cfg.superDen)) {
            const lat = env.now - a * st.cfg.slotMs;
            st.optimistic[String(a)] = { at: env.now, latencyMs: lat };
            env.emit({ kind: "optimistic", slot: a, by: to, latencyMs: lat });
          }
          return true;
        });
        // The voter's reported root: it (and its ancestors) are rooted by that voter.
        if (body.root !== undefined && body.root >= 0) {
          walkChain(pv.blocks, body.root, (a) => {
            const list = (pv.rootVoters[String(a)] ??= []);
            if (!addVoter(list, msg.from)) return false;
            if (!st.global[String(a)] && env.stakeThreshold(list, st.cfg.superNum, st.cfg.superDen)) {
              markFinalized(st, to, a, env);
            }
            return true;
          });
        }
      }
    },
  };
}

export function legacyStatus(st: TowerBftState, slot: number) {
  return st.global[String(slot)];
}
export function optimisticStatus(st: TowerBftState, slot: number) {
  return st.optimistic[String(slot)];
}
