/**
 * Mulberry32. The entire state is one 32-bit integer, so snapshotting is
 * trivial. This is the ONLY source of randomness in the simulation: nothing
 * may call Math.random(). Draw order matters, so avoid conditional draws that
 * differ between otherwise-identical runs.
 */
export class Rng {
  private a: number;
  constructor(seed: number) {
    this.a = seed | 0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.a = (this.a + 0x6d2b79f5) | 0;
    let t = Math.imul(this.a ^ (this.a >>> 15), 1 | this.a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [lo, hi). */
  int(lo: number, hi: number): number {
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || hi <= lo) {
      throw new RangeError(`Rng.int: invalid range [${lo}, ${hi})`);
    }
    return lo + Math.floor(this.next() * (hi - lo));
  }

  getState(): number {
    return this.a;
  }
  setState(s: number): void {
    this.a = s | 0;
  }
}
