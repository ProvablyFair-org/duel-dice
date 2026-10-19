/**
 * FALSE-ALARM RATES of the statistical rules that can move the verdict.
 *
 * THE STANDARD (agreed 2026-10-06): a statistical rule may move a verdict only if its false-alarm
 * rate on a fair game is written down, and it is at most 5% for a rule that moves a step to FLAG and
 * at most 1% for a rule that moves a step to FAIL. "On a fair game" means: every draw is the declared
 * algorithm on a seed the operator did not choose, so each roll is exactly uniform on the 0..10000
 * lattice (Step 19 proves the modulo bias is 0) and independent of every other roll.
 *
 * In this package the statistical rules are all FAIL rules:
 *
 *   Step 6   collision counts under a wrong and an empty client seed (exact binomial tails);
 *   Step 16  the three Pass 1 screens (draw uniformity, lag-1, runs) and the ten edge bands;
 *   Step 17  the Pass 2 cherry-pick test on the served early-window return.
 *
 * Every rate is computed here from the rule as the step implements it, not from the rule's nominal
 * level, because the two differ: the uniformity histogram's bin 0 holds 101 of the 10,001 lattice
 * values while the screen takes every bin's expected count as equal, so the screen rejects a fair
 * census more often than its nominal level; the lag-1 and runs screens read the same draws and their
 * statistics are correlated, so their joint rate is not the sum of the two; and the Pass 2 aggregate
 * return is skewed, so the normal tail it is tested against overstates its lower tail. Exact where an
 * exact form exists; the one rate that has none (Step 17) is a declared result of a calibrated
 * simulation that `npm run false-alarm:pass2` reproduces (src/false-alarm-pass2.ts).
 */

import { chiSquaredPValue, logGamma } from './stats';

/** A rule that moves a step to FLAG may fire on a fair game at most this often. */
export const FLAG_FALSE_ALARM_CAP = 0.05;
/** A rule that moves a step to FAIL may fire on a fair game at most this often. */
export const FAIL_FALSE_ALARM_CAP = 0.01;

/** A rate rounded to 4 significant digits: the figure printed and recorded (machine-independent). */
export const rate4 = (x: number): number => Number(x.toPrecision(4));

/** A rate for a detail line: 4 decimals at or above 0.001, otherwise one-digit scientific. */
export const fmtRate = (x: number): string => (x >= 0.001 ? x.toFixed(4) : x.toExponential(1));

// ── Exact binomial tails, in log space (no overflow at n = 1,000,000) ──────────────────────────────

function logBinomPmf(n: number, p: number, k: number): number {
  return logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1) + k * Math.log(p) + (n - k) * Math.log1p(-p);
}

/** Exact P(X ≥ k) for X ~ Binomial(n, p), summed as 1 − P(X < k) (k small) or directly (k large). */
export function binomialTailAtLeast(n: number, p: number, k: number): number {
  if (k <= 0) return 1;
  if (k > n) return 0;
  if (k <= n * p) {
    let lower = 0;
    for (let i = 0; i < k; i++) lower += Math.exp(logBinomPmf(n, p, i));
    return Math.max(0, 1 - lower);
  }
  let s = 0;
  for (let i = k; i <= n; i++) {
    const t = Math.exp(logBinomPmf(n, p, i));
    s += t;
    if (t < s * 1e-18) break;
  }
  return Math.min(1, s);
}

/** Exact P(X < lo) + P(X > hi) for X ~ Binomial(n, p), lo ≤ n·p ≤ hi, each tail summed outward. */
export function binomialOutside(n: number, p: number, lo: number, hi: number): number {
  let s = 0;
  for (let k = lo - 1; k >= 0; k--) {
    const t = Math.exp(logBinomPmf(n, p, k));
    s += t;
    if (t < s * 1e-18) break;
  }
  let u = 0;
  for (let k = hi + 1; k <= n; k++) {
    const t = Math.exp(logBinomPmf(n, p, k));
    u += t;
    if (t < u * 1e-18) break;
  }
  return Math.min(1, s + u);
}

// ── Normal tails at full precision (the Q(1/2, ·) identity, ~14 digits) ────────────────────────────

/** P(Z > z) for a standard normal: P(χ²₁ > z²) / 2 for z ≥ 0. */
function normalUpper(z: number): number {
  const half = z === 0 ? 0.5 : chiSquaredPValue(z * z, 1) / 2;
  return z >= 0 ? half : 1 - half;
}

/** The z with P(Z > z) = q, by bisection on normalUpper (0 < q < 0.5). */
function normalUpperQuantile(q: number): number {
  let lo = 0, hi = 40;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (normalUpper(mid) > q) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// ── Step 16 (a): the draw-uniformity screen ─────────────────────────────────────────────────────

export interface UniformityFalseAlarm {
  /** Lattice values in each histogram bin, binned exactly as src/simulate.ts bins a roll. */
  binSizes: number[];
  /** Non-centrality of the equal-count Pearson statistic against the true lattice bin probabilities. */
  noncentrality: number;
  nominal: number;
  upperTail: number;
  lowerTail: number;
  rate: number;
}

/**
 * The two-sided chi-squared screen as Step 16 applies it: the Pearson statistic against EQUAL expected
 * counts draws/bins, rejected when its df = bins − 1 p-value is below alpha/2 or above 1 − alpha/2. On
 * a fair game the bin probabilities are the lattice counts / range, not 1/bins, so the statistic is
 * non-central chi-squared with λ = Σ (draws·pᵢ − draws/bins)² / (draws/bins); the rate is the
 * Poisson(λ/2) mixture of central chi-squared tails at the screen's two critical values.
 */
export function uniformityScreenFalseAlarm(range: number, bins: number, draws: number, alpha: number): UniformityFalseAlarm {
  const binWidth = range / bins;                         // the BIN_WIDTH of src/simulate.ts
  const binSizes = new Array<number>(bins).fill(0);
  for (let r = 0; r < range; r++) binSizes[Math.min(bins - 1, Math.floor(r / binWidth))]++;
  const e = draws / bins;
  let lambda = 0;
  for (const s of binSizes) lambda += (draws * s / range - e) ** 2 / e;
  const df = bins - 1;
  // Critical values of the screen: p(cU) = alpha/2 (upper), p(cL) = 1 − alpha/2 (lower).
  const solve = (target: number): number => {
    let lo = 0, hi = df + 2000;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      if (chiSquaredPValue(mid, df) > target) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  };
  const cU = solve(alpha / 2), cL = solve(1 - alpha / 2);
  let upper = 0, lower = 0, w = Math.exp(-lambda / 2);
  for (let j = 0; j < 400; j++) {
    if (j > 0) w *= (lambda / 2) / j;
    upper += w * chiSquaredPValue(cU, df + 2 * j);
    lower += w * (1 - chiSquaredPValue(cL, df + 2 * j));
    if (j > lambda && w < 1e-20) break;
  }
  return { binSizes, noncentrality: lambda, nominal: alpha, upperTail: upper, lowerTail: lower, rate: upper + lower };
}

// ── Step 16 (b): the lag-1 and runs screens on the same draws ────────────────────────────────────

export interface SerialFalseAlarm {
  /** Asymptotic correlation of the lag-1 z (raw rolls) and the runs z (rolls split at `mid`). */
  correlation: number;
  zCrit: number;
  lag1: number;
  runs: number;
  /** P(lag-1 screen OR runs screen rejects) on a fair game — the bivariate normal union. */
  either: number;
}

/**
 * Both screens are two-sided at `alpha` on the same draw sequence: the lag-1 z of the raw rolls and
 * the Wald–Wolfowitz runs z of the rolls split at `mid` (side 1 = roll ≥ mid). Each is asymptotically
 * standard normal on a fair game, so each fires with probability alpha; they are not independent. Per
 * adjacent pair, the lag-1 term is aᵢaᵢ₊₁ (a the standardized roll) and the runs term is the indicator
 * that sᵢ ≠ sᵢ₊₁, and the only non-zero covariance between them is within the same pair:
 * −2·E[a·s]². So the correlation of the two z's is −2·E[a·s]² / (2q(1−q)), with q = P(roll ≥ mid),
 * computed here from the lattice; on 0..10000 split at 5000 it is −0.75. The probability that either
 * fires is the bivariate-normal union at that correlation, integrated numerically.
 */
export function serialScreensFalseAlarm(range: number, mid: number, alpha: number): SerialFalseAlarm {
  let mean = 0;
  for (let x = 0; x < range; x++) mean += x;
  mean /= range;
  let v = 0;
  for (let x = 0; x < range; x++) v += (x - mean) ** 2;
  const sd = Math.sqrt(v / range);
  let eas = 0, q = 0;
  for (let x = 0; x < range; x++) if (x >= mid) { eas += (x - mean) / sd; q++; }
  eas /= range; q /= range;
  const rho = (-2 * eas * eas) / (2 * q * (1 - q));
  const c = normalUpperQuantile(alpha / 2);
  // P(either) = P(|Z1| ≥ c) + ∫_{|x|<c} φ(x) · P(|Z2| ≥ c | Z1 = x) dx, Z2 | x ~ N(ρx, 1 − ρ²).
  const s = Math.sqrt(1 - rho * rho);
  const f = (x: number): number => {
    const phi = Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
    return phi * (normalUpper((c - rho * x) / s) + normalUpper((c + rho * x) / s));
  };
  const N = 4000, h = (2 * c) / N;
  let integral = f(-c) + f(c);
  for (let i = 1; i < N; i++) integral += (i % 2 ? 4 : 2) * f(-c + i * h);
  integral *= h / 3;
  const marginal = 2 * normalUpper(c);
  return { correlation: rho, zCrit: c, lag1: marginal, runs: marginal, either: marginal + integral };
}

// ── Step 16 (c): the edge bands ──────────────────────────────────────────────────────────────────

/**
 * One edge band, as Step 16 scores it: n bets at win probability p and multiplier mult pass when
 * |wins·mult/n − rtp| ≤ 5·SE + 1e-4, SE = √(p(1−p))·mult/√n. The passing win counts are found with
 * that exact predicate; the rate is the exact binomial mass outside them.
 */
export function edgeBandFalseAlarm(n: number, p: number, mult: number, rtp: number): { lo: number; hi: number; rate: number } {
  const se = Math.sqrt(p * (1 - p)) * mult / Math.sqrt(n);
  const ok = (w: number): boolean => Math.abs((w / n) * mult - rtp) <= 5 * se + 1e-4;
  let lo = Math.round(n * p), hi = lo;
  while (lo > 0 && ok(lo - 1)) lo--;
  while (hi < n && ok(hi + 1)) hi++;
  return { lo, hi, rate: binomialOutside(n, p, lo, hi) };
}

// ── Step 17: the Pass 2 cherry-pick test — declared, from a calibrated simulation ────────────────

/**
 * Step 17 rejects when the aggregate early-window return, standardized by its exact mean and
 * variance, has a one-sided normal lower-tail p below 0.01. The return is a sum of 6,700 scaled
 * Bernoullis (one per served slot) whose distribution is right-skewed (1,000 slots at target 9,800
 * pay 49.95× with probability 0.02; 700 at 9,700 pay 33.30× with probability 0.03), so its true lower
 * tail at the normal 1% point is lighter than 1%. No closed form exists for that tail. This is the
 * output of `npm run false-alarm:pass2` (src/false-alarm-pass2.ts): the slots served at a target at
 * least 100 times are summed exactly over their binomial win counts, the remaining slots are simulated,
 * and the rate is the mean of the exact conditional probability over the replicates (a conditioned
 * Monte Carlo, so its standard error is smaller than a plain count would give). The script reads the
 * dataset and the rule's own threshold, and says whether its result equals this declaration.
 */
export const PASS2_FALSE_ALARM = Object.freeze({
  rate: 0.003601,
  standardError: 0.0000078,
  replicates: 1_000_000,
  seed: 20261006,
  method: 'conditioned Monte Carlo: exact over the slots served at one target 100 or more times, simulated over the rest',
});
