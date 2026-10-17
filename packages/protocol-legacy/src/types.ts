export type TbConfig = {
  slotMs: number;
  /** Supermajority as a fraction of stake (default 2/3). */
  superNum: number;
  superDen: number;
  /** Tower depth; the bottom vote is rooted when the stack exceeds this (Solana: 31). */
  maxLockoutHistory: number;
};

export type TowerEntry = { slot: number; conf: number };

/** One validator's local state. All plain data. */
export type TbValidator = {
  /** blocks[slot] = parent slot (-1 = genesis). */
  blocks: Record<string, number>;
  tower: TowerEntry[];
  /** Newest slot this validator has rooted (-1 = none). */
  root: number;
  lastVote: number;
  /** voters[slot]: validators whose votes (on the slot or a descendant) confirm it. */
  voters: Record<string, number[]>;
  /** rootVoters[slot]: validators that have rooted the slot (or a descendant). */
  rootVoters: Record<string, number[]>;
};

export type TbGlobalSlot = {
  status: "finalized" | "skipped";
  at: number;
  by: number;
  latencyMs: number;
};

export type TowerBftState = {
  cfg: TbConfig;
  cur: number[];
  vals: TbValidator[];
  /** First time any validator saw a supermajority root the slot (or learned it was skipped). */
  global: Record<string, TbGlobalSlot>;
  /** First time any validator saw >= 2/3 stake vote on the slot or a descendant ("optimistic confirmation"). */
  optimistic: Record<string, { at: number; latencyMs: number }>;
};
