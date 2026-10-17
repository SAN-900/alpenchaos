import type { GameConfig, PlayerState } from "./types";

/** Energy regenerates lazily from elapsed sim time: no timers, always deterministic. */
export function energyMilli(p: PlayerState, cfg: GameConfig, now: number): number {
  return Math.min(cfg.energyMaxMilli, p.energyMilli + (now - p.at) * cfg.regenMilliPerMs);
}
export const energyUnits = (p: PlayerState, cfg: GameConfig, now: number): number => energyMilli(p, cfg, now) / 1000;

export function canAfford(p: PlayerState, cfg: GameConfig, now: number, cost: number): boolean {
  return energyMilli(p, cfg, now) >= cost * 1000;
}

export function spend(p: PlayerState, cfg: GameConfig, now: number, cost: number): void {
  p.energyMilli = energyMilli(p, cfg, now) - cost * 1000;
  p.at = now;
}
