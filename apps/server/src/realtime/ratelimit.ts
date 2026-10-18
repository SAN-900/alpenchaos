/** Token bucket with an injected clock: `take(now)` returns false when the caller is going too fast. */
export class TokenBucket {
  private tokens: number;
  private last: number;
  constructor(
    private capacity: number,
    private refillPerSec: number,
    now: number,
  ) {
    this.tokens = capacity;
    this.last = now;
  }
  take(now: number, cost = 1): boolean {
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) / 1000) * this.refillPerSec);
    this.last = now;
    if (this.tokens < cost) return false;
    this.tokens -= cost;
    return true;
  }
}
