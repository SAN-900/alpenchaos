/**
 * Deterministic power function for the simulation.
 *
 * Math.pow / Math.exp / Math.log are only required to be "implementation
 * approximated" by the ECMAScript spec, so V8 (Node, Chrome), JavaScriptCore
 * (Bun, Safari) and SpiderMonkey (Firefox) may disagree in the last bit. A
 * one-bit difference can move a floor() boundary and change a stake, which
 * changes a whole match. +, -, *, / and Math.round are exactly specified
 * (IEEE-754, round-to-nearest), so this version, built only from them, gives
 * bit-identical results in every engine.
 *
 * Accuracy is about 1e-14 relative, plenty for stake weights. For the
 * (n, zipfS) configurations the game can produce, it yields exactly the same
 * stakes as Math.pow does in V8, so adopting it changed no existing result.
 */
const LN2 = 0.6931471805599453;

function ln(x: number): number {
  let k = 0;
  while (x >= 1.5) { x /= 2; k++; }
  while (x < 0.75) { x *= 2; k--; }
  const y = (x - 1) / (x + 1);
  const y2 = y * y;
  let term = y;
  let sum = 0;
  for (let i = 0; i < 40; i++) { // fixed iteration count: same work in every engine
    sum += term / (2 * i + 1);
    term *= y2;
  }
  return 2 * sum + k * LN2;
}

function exp(y: number): number {
  const k = Math.round(y / LN2);
  const r = y - k * LN2;
  let term = 1;
  let sum = 1;
  for (let i = 1; i < 30; i++) {
    term *= r / i;
    sum += term;
  }
  const n = Math.abs(k);
  for (let j = 0; j < n; j++) sum = k >= 0 ? sum * 2 : sum / 2; // exact scaling by 2^k
  return sum;
}

/** x^s for x >= 1 and s >= 0, identical in every JavaScript engine. */
export function detPow(x: number, s: number): number {
  if (!(x >= 1) || !(s >= 0) || !Number.isFinite(x) || !Number.isFinite(s)) {
    throw new RangeError(`detPow: need finite x >= 1 and s >= 0, got x=${x}, s=${s}`);
  }
  if (s === 0 || x === 1) return 1;
  return exp(s * ln(x));
}
