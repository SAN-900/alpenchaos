import type { Protocol, ProtocolEnv, ProtocolMessage } from "@alpenchaos/shared";
import type { AgConfig, AlpenglowState, GlobalSlot, SlotView } from "./types";

export const DEFAULT_AG_CONFIG: AgConfig = { slotMs: 400, timeoutMs: 450, fastPct: 80, slowPct: 60 };

const KEEP_SLOTS = 60;

const newView = (): SlotView => ({
  vote: "none",
  notar: [],
  final: [],
  skip: [],
  fastCert: false,
  notarCert: false,
  skipCert: false,
  finalVoted: false,
});

function view(st: AlpenglowState, v: number, slot: number): SlotView {
  const m = st.views[v]!;
  const k = String(slot);
  return (m[k] ??= newView());
}

function addVoter(list: number[], from: number): boolean {
  if (list.includes(from)) return false;
  list.push(from);
  return true;
}

function record(st: AlpenglowState, slot: number, g: GlobalSlot, env: ProtocolEnv): void {
  const k = String(slot);
  if (st.global[k]) return;
  st.global[k] = g;
  env.emit({ kind: g.status, slot, by: g.by, path: g.path, latencyMs: g.latencyMs });
}

function settleFinal(st: AlpenglowState, v: number, slot: number, vw: SlotView, path: "fast" | "slow", env: ProtocolEnv) {
  if (vw.result) return;
  vw.result = "finalized";
  vw.path = path;
  vw.at = env.now;
  record(st, slot, { status: "finalized", path, at: env.now, by: v, latencyMs: env.now - slot * st.cfg.slotMs }, env);
}

function settleSkip(st: AlpenglowState, v: number, slot: number, vw: SlotView, env: ProtocolEnv) {
  if (vw.result) return;
  vw.result = "skipped";
  vw.at = env.now;
  record(st, slot, { status: "skipped", at: env.now, by: v, latencyMs: env.now - slot * st.cfg.slotMs }, env);
}

/**
 * Simplified Alpenglow (Votor + skip logic). What is modelled:
 *  - Leader broadcasts one block at slot start (no relays/erasure coding).
 *  - Validators vote notarize on the block, or skip after `timeoutMs`.
 *  - Fast path: >= fastPct (80%) notarize votes finalizes in one round.
 *  - Slow path: >= slowPct (60%) notarize votes -> notarization cert -> finalize
 *    votes; >= 60% finalize votes finalizes (two rounds). Both run concurrently.
 *  - >= 60% skip votes -> skip certificate.
 * Not modelled: Rotor, BLS aggregation cost, notar-fallback/skip-fallback votes,
 * certificate re-broadcast/repair, equivocating leaders, parent-ready rules.
 * Consequence: slots that miss every threshold stay pending forever.
 */
export function createAlpenglow(cfg: Partial<AgConfig> = {}): Protocol<AlpenglowState> {
  const config: AgConfig = { ...DEFAULT_AG_CONFIG, ...cfg };

  return {
    name: "ag",

    init: (n) => ({
      cfg: { ...config },
      cur: new Array<number>(n).fill(-1),
      views: Array.from({ length: n }, () => ({}) as Record<string, SlotView>),
      global: {},
    }),

    start(_st, env) {
      for (let v = 0; v < env.validators; v++) env.setTimer(v, 0, "slot", { slot: 0 });
    },

    onTimer(st, v, kind, body, env) {
      const slot = (body as { slot: number }).slot;
      if (kind === "slot") {
        env.setTimer(v, st.cfg.slotMs, "slot", { slot: slot + 1 }); // clock chain survives crashes
        if (!env.isUp(v)) return;
        st.cur[v] = slot;
        view(st, v, slot);
        env.setTimer(v, st.cfg.timeoutMs, "timeout", { slot });
        if (env.leaderForSlot(slot) === v) {
          env.emit({ kind: "block", slot, leader: v });
          env.broadcast(v, "block", { slot }, true);
        }
        const m = st.views[v]!;
        for (const k of Object.keys(m)) if (Number(k) < slot - KEEP_SLOTS) delete m[k];
        return;
      }
      if (kind === "timeout") {
        if (!env.isUp(v)) return;
        const vw = view(st, v, slot);
        if (vw.vote === "none") {
          vw.vote = "skip";
          env.broadcast(v, "skip", { slot }, true);
        }
      }
    },

    onMessage(st, to, msg: ProtocolMessage, env) {
      const slot = (msg.body as { slot: number }).slot;
      if (slot < st.cur[to]! - KEEP_SLOTS) return;
      const vw = view(st, to, slot);

      switch (msg.kind) {
        case "block": {
          if (msg.from !== env.leaderForSlot(slot)) return;
          if (vw.vote !== "none") return; // already voted (e.g. skip after timeout)
          vw.vote = "notar";
          env.broadcast(to, "notar", { slot }, true);
          return;
        }
        case "notar": {
          if (!addVoter(vw.notar, msg.from)) return;
          if (!vw.fastCert && env.stakeThreshold(vw.notar, st.cfg.fastPct, 100)) {
            vw.fastCert = true;
            settleFinal(st, to, slot, vw, "fast", env);
          }
          if (!vw.notarCert && env.stakeThreshold(vw.notar, st.cfg.slowPct, 100)) {
            vw.notarCert = true;
            if (vw.vote === "notar" && !vw.finalVoted) {
              vw.finalVoted = true;
              env.broadcast(to, "final", { slot }, true);
            }
          }
          return;
        }
        case "final": {
          if (!addVoter(vw.final, msg.from)) return;
          if (env.stakeThreshold(vw.final, st.cfg.slowPct, 100)) settleFinal(st, to, slot, vw, "slow", env);
          return;
        }
        case "skip": {
          if (!addVoter(vw.skip, msg.from)) return;
          if (!vw.skipCert && env.stakeThreshold(vw.skip, st.cfg.slowPct, 100)) {
            vw.skipCert = true;
            settleSkip(st, to, slot, vw, env);
          }
          return;
        }
      }
    },
  };
}

/** Network-wide status of a slot (first validator to settle it), or undefined if still pending. */
export function slotStatus(st: AlpenglowState, slot: number): GlobalSlot | undefined {
  return st.global[String(slot)];
}
