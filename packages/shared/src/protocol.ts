import type { SimTime } from "./events";

/** A message as seen by a protocol. `kind` is the protocol-local kind (no prefix). */
export type ProtocolMessage = { from: number; to: number; kind: string; body: unknown };

/**
 * Everything a protocol may do. Deliberately small and function-based, so
 * protocols don't depend on the network or engine packages and can be unit
 * tested against a fake env. Validators are addressed by index.
 */
export interface ProtocolEnv {
  readonly now: SimTime;
  readonly validators: number;
  isUp(v: number): boolean;
  leaderForSlot(slot: number): number;
  /** True if the (deduplicated) voters hold at least num/den of total stake. Exact integer math. */
  stakeThreshold(voters: readonly number[], num: number, den: number): boolean;
  send(from: number, to: number, kind: string, body?: unknown): void;
  broadcast(from: number, kind: string, body?: unknown, includeSelf?: boolean): void;
  /** Fire onTimer(v, kind, body) after `delayMs` (integer >= 0). */
  setTimer(v: number, delayMs: number, kind: string, body?: unknown): void;
  /** Add an entry to the trace for the UI. Time and protocol name are added for you. */
  emit(entry: { kind: string; [key: string]: unknown }): void;
}

/**
 * A consensus protocol. `S` must be plain serializable data (no functions,
 * classes, Maps or Sets) so engine snapshots work. All behaviour lives in the
 * methods; all memory lives in `S`.
 *
 * Rules:
 *  - Use only `env` for time, randomness-free scheduling, and I/O.
 *  - onMessage is only called for messages that were actually delivered to a
 *    live validator.
 *  - onTimer is called even if the validator is down, so periodic timer
 *    chains survive a crash. Check env.isUp(v) before acting.
 */
export interface Protocol<S> {
  /** Short unique prefix, e.g. "ag". Namespaces message kinds and trace kinds. */
  readonly name: string;
  init(validators: number): S;
  start(state: S, env: ProtocolEnv): void;
  onMessage(state: S, to: number, msg: ProtocolMessage, env: ProtocolEnv): void;
  onTimer(state: S, v: number, kind: string, body: unknown, env: ProtocolEnv): void;
}
