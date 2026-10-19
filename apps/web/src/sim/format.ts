import type { TxOutcome } from "@alpenchaos/fault-injection";

/** 204 -> "204 ms", 12 480 -> "12.5 s". */
export function fmtMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "-";
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** Simulated clock as m:ss.s */
export function fmtClock(ms: number): string {
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
}

/** How many times faster `fast` is than `slow`, or null if either is unknown. */
export function speedup(fast: number | null, slow: number | null): number | null {
  if (fast === null || slow === null || fast <= 0) return null;
  return slow / fast;
}

export function describeOutcome(o: TxOutcome): { label: string; tone: "good" | "bad" | "wait" } {
  switch (o.status) {
    case "landed":
      return { label: `landed in ${fmtMs(o.latencyMs)}`, tone: "good" };
    case "pending":
      return { label: o.includedSlot === undefined ? "waiting for a block" : `in slot ${o.includedSlot}, not final yet`, tone: "wait" };
    case "abandoned":
      return { label: `abandoned in slot ${o.includedSlot}${o.retryable ? " (can retry)" : " (too late to retry)"}`, tone: "bad" };
    case "dropped":
      return { label: "dropped: no leader built a block", tone: "bad" };
    case "expired":
      return { label: "blockhash expired", tone: "bad" };
  }
}
