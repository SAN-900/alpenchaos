import type { Scenario } from "@alpenchaos/scenarios";
import { create } from "zustand";
import { SimDriver, type Frame } from "../sim/driver";

export const SPEEDS = [0.5, 1, 2, 4, 8] as const;
export type Speed = (typeof SPEEDS)[number];

/** Never advance more than this much simulated time per tick, whatever the speed. */
const MAX_SIM_STEP_MS = 1000;
/** A backgrounded tab can report a huge frame gap. Treat it as a short one. */
const MAX_WALL_DT_MS = 100;

export type SimStore = {
  driver: SimDriver | null;
  frame: Frame | null;
  playing: boolean;
  speed: Speed;
  /** Lite mode: no message tracing, lower frame rate, no animation. */
  lite: boolean;
  load(scenario: Scenario): void;
  toggle(): void;
  setSpeed(speed: Speed): void;
  /** Switch lite mode. Rebuilds the run at the same moment, which is exact because the engine is deterministic. */
  setLite(lite: boolean): void;
  restart(): void;
  /** Jump to a simulated time. Going backwards re-simulates from zero (~0.5 s for a 30 s run). */
  seek(t: number): void;
  /** Called by the animation loop with the wall-clock ms since the last call. */
  tick(wallDtMs: number): void;
};

/** Sub-millisecond remainder, so 0.5x speed does not round every tick down to zero. */
let carry = 0;

export const useSim = create<SimStore>((set, get) => ({
  driver: null,
  frame: null,
  playing: false,
  speed: 1,
  lite: false,

  load(scenario) {
    const driver = new SimDriver(scenario, { dots: !get().lite });
    carry = 0;
    set({ driver, frame: driver.frame(), playing: true });
  },

  toggle() {
    const { driver, frame, playing } = get();
    if (!driver || !frame) return;
    if (frame.done) return get().restart();
    set({ playing: !playing });
  },

  setSpeed(speed) {
    set({ speed });
  },

  setLite(lite) {
    const { driver, lite: was } = get();
    if (lite === was) return;
    if (!driver) return set({ lite });
    const next = new SimDriver(driver.scenario, { dots: !lite });
    next.seek(driver.now);
    set({ lite, driver: next, frame: next.frame() });
  },

  restart() {
    const { driver } = get();
    if (!driver) return;
    driver.reset();
    carry = 0;
    set({ frame: driver.frame(), playing: true });
  },

  seek(t) {
    const { driver } = get();
    if (!driver) return;
    driver.seek(t);
    carry = 0;
    set({ frame: driver.frame() });
  },

  tick(wallDtMs) {
    const { driver, playing, speed } = get();
    if (!driver || !playing) return;
    carry += Math.min(wallDtMs, MAX_WALL_DT_MS) * speed;
    const step = Math.floor(carry);
    if (step < 1) return;
    carry -= step;
    driver.advanceTo(driver.now + Math.min(step, MAX_SIM_STEP_MS));
    const frame = driver.frame();
    set({ frame, playing: !frame.done });
  },
}));
