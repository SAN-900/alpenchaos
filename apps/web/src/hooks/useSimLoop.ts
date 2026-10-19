"use client";

import { useEffect } from "react";
import { useSim } from "../store/sim";

const FULL_FPS = 30;
const LITE_FPS = 15;

/**
 * Drives the simulation from requestAnimationFrame while mounted. The browser already pauses
 * rAF in background tabs, and the store clamps long gaps, so a hidden tab costs nothing.
 */
export function useSimLoop(): void {
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const interval = 1000 / (useSim.getState().lite ? LITE_FPS : FULL_FPS);
      const dt = now - last;
      // 2 ms of slack: rAF timestamps jitter, and without it 30 fps often lands on 20.
      if (dt >= interval - 2) {
        last = now;
        useSim.getState().tick(dt);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
}
