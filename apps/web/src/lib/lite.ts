/**
 * "Lite" mode: half the frame rate, no message dots, no animations. Chosen automatically on
 * modest hardware or when the user asks the browser to save data / reduce motion, and
 * overridable with a toggle that is remembered.
 */
const KEY = "alpenchaos:lite";

type NavigatorHints = Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };

export function detectLite(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as NavigatorHints;
  const lowMemory = nav.deviceMemory !== undefined && nav.deviceMemory <= 2;
  const fewCores = (nav.hardwareConcurrency ?? 8) <= 2;
  const saveData = nav.connection?.saveData === true;
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  return lowMemory || fewCores || saveData || reduceMotion;
}

/** null means "no saved choice". Storage can be blocked (private mode), so never throw. */
export function readLitePref(): boolean | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "1" ? true : v === "0" ? false : null;
  } catch {
    return null;
  }
}

export function writeLitePref(lite: boolean): void {
  try {
    localStorage.setItem(KEY, lite ? "1" : "0");
  } catch {
    /* ignore */
  }
}
