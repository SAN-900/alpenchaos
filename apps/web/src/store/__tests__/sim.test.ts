import { beforeEach, describe, expect, test } from "vitest";
import { getScenario } from "@alpenchaos/scenarios";
import { useSim } from "../sim";

const load = (id = "baseline") => useSim.getState().load(getScenario(id)!);
const s = () => useSim.getState();

beforeEach(() => {
  useSim.setState({ driver: null, frame: null, playing: false, speed: 1, lite: false });
});

describe("sim store", () => {
  test("load starts playing at t=0", () => {
    load();
    expect(s().playing).toBe(true);
    expect(s().frame!.now).toBe(0);
  });

  test("tick advances simulated time by wall time x speed", () => {
    load();
    s().tick(100);
    expect(s().frame!.now).toBe(100);
    s().setSpeed(4);
    s().tick(100);
    expect(s().frame!.now).toBe(500);
  });

  test("0.5x keeps its fractions instead of rounding to nothing", () => {
    load();
    s().setSpeed(0.5);
    for (let i = 0; i < 4; i++) s().tick(1); // 0.5 ms each
    expect(s().frame!.now).toBe(2);
  });

  test("a huge frame gap (backgrounded tab) is treated as a short one", () => {
    load();
    s().tick(60_000);
    expect(s().frame!.now).toBe(100);
  });

  test("pause stops time, play resumes it", () => {
    load();
    s().toggle();
    s().tick(100);
    expect(s().frame!.now).toBe(0);
    s().toggle();
    s().tick(100);
    expect(s().frame!.now).toBe(100);
  });

  test("reaching the end stops playback; toggle then replays", () => {
    load();
    s().setSpeed(8);
    for (let i = 0; i < 400 && s().playing; i++) s().tick(100);
    expect(s().frame!.done).toBe(true);
    expect(s().playing).toBe(false);
    s().toggle();
    expect(s().frame!.now).toBe(0);
    expect(s().playing).toBe(true);
  });

  test("seek jumps both ways and leaves play state alone", () => {
    load("leader-kill");
    s().seek(9000);
    expect(s().frame!.now).toBe(9000);
    const at9 = JSON.stringify(s().frame);
    s().seek(2000);
    expect(s().frame!.now).toBe(2000);
    s().seek(9000);
    expect(JSON.stringify(s().frame)).toBe(at9);
    expect(s().playing).toBe(true);
  });

  test("restart rewinds to zero", () => {
    load();
    s().tick(100);
    s().restart();
    expect(s().frame!.now).toBe(0);
  });

  test("lite mode: loads without message dots", () => {
    s().setLite(true);
    load();
    s().tick(100);
    s().seek(2000);
    expect(s().frame!.dots).toEqual([]);
  });

  test("switching lite mode mid-run keeps the run exactly where it was", () => {
    load("partition-20");
    s().seek(9000);
    const before = JSON.parse(JSON.stringify(s().frame));
    expect(before.dots.length).toBeGreaterThan(0);
    s().setLite(true);
    expect(s().lite).toBe(true);
    expect(s().frame!.now).toBe(9000);
    expect(JSON.stringify({ ...s().frame, dots: [] })).toBe(JSON.stringify({ ...before, dots: [] }));
    expect(s().frame!.dots).toEqual([]);
    s().setLite(false);                           // and back again
    expect(s().frame!.now).toBe(9000);
    expect(s().frame!.dots.length).toBeGreaterThan(0);
  });

  test("setLite before anything is loaded just records the choice", () => {
    s().setLite(true);
    expect(s().lite).toBe(true);
    expect(s().driver).toBe(null);
  });

  test("actions before a scenario is loaded do nothing", () => {
    expect(() => { s().tick(100); s().seek(5); s().restart(); s().toggle(); }).not.toThrow();
    expect(s().frame).toBe(null);
  });
});
