/**
 * Statistical tests for dice audit.
 *
 * chiSquaredTest   — goodness-of-fit with exact p-values via regularized incomplete gamma.
 * lagOneAutocorrelation — lag-1 autocorrelation of a numeric series.
 * waldsWolfowitzRunsTest — Wald-Wolfowitz runs test for serial randomness.
 */

// ── Chi-squared ────────────────────────────────────────────────────────────────

export interface ChiSquaredResult {
  chi2: number;
  df: number;
  pValue: number;
}

/**
 * Chi-squared goodness-of-fit.
 * Bins with expected < 5 are pooled with their neighbours before the test.
 * Returns chi2, degrees of freedom, and exact p-value via regularized incomplete gamma.
 */
export function chiSquaredTest(
  observed: number[],
  expected: number[],
): ChiSquaredResult {
  if (observed.length !== expected.length) {
    throw new Error('observed and expected must have the same length');
  }

  // Pool bins with expected < 5 — front tail
  let obs = [...observed];
  let exp = [...expected];

  while (obs.length > 2 && exp[0] < 5) {
    obs[1] += obs[0]; exp[1] += exp[0];
    obs.shift(); exp.shift();
  }
  // Back tail
  while (obs.length > 2 && exp[exp.length - 1] < 5) {
    const n = obs.length;
    obs[n - 2] += obs[n - 1]; exp[n - 2] += exp[n - 1];
    obs.pop(); exp.pop();
  }

  let chi2 = 0;
  for (let i = 0; i < obs.length; i++) {
    if (exp[i] > 0) {
      chi2 += (obs[i] - exp[i]) ** 2 / exp[i];
    }
  }

  const df     = obs.length - 1;
  const pValue = 1 - regularizedGamma(df / 2, chi2 / 2);

  return { chi2, df, pValue };
}

/** Upper-tail p-value of a chi-squared statistic with df degrees of freedom, no pooling. */
export function chiSquaredPValue(chi2: number, df: number): number {
  if (!Number.isFinite(chi2) || chi2 < 0 || df <= 0) return NaN;
  return 1 - regularizedGamma(df / 2, chi2 / 2);
}

// ── Exact binomial upper tail ──────────────────────────────────────────────────

/** C(n,k) via the multiplicative formula (no factorial overflow for the n used here). */
export function combination(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  k = Math.min(k, n - k);
  let c = 1;
  for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1);
  return c;
}

/** Exact upper binomial tail P(X ≥ k) for X ~ Binomial(n, p). */
export function binomialTailP(n: number, k: number, p: number): number {
  if (k <= 0) return 1;
  if (k > n) return 0;
  let s = 0;
  for (let i = k; i <= n; i++) s += combination(n, i) * p ** i * (1 - p) ** (n - i);
  return Math.min(1, s);
}

// ── Wald–Wolfowitz runs statistic FROM CELL COUNTS ─────────────────────────────
// The re-derivable form: given the number of runs, the count above the split (n1) and the total
// n, recompute the expectation, variance and z. Degenerate iff the variance is 0 (every value on
// one side of the split) — NOT z === 0, which is an ordinary outcome. So a verifier can recompute
// runsZ from the census the simulation stored rather than trusting the artifact's own scalar.
export interface RunsFromCounts {
  expected: number;
  variance: number;
  z: number;
  pValue: number;
  degenerate: boolean;
}

export function runsStatisticFromCounts(runs: number, n1: number, n: number): RunsFromCounts {
  const n2 = n - n1;
  const expected = (2 * n1 * n2) / n + 1;
  const variance = (2 * n1 * n2 * (2 * n1 * n2 - n)) / (n * n * (n - 1));
  const degenerate = !(variance > 0);
  const z = degenerate ? 0 : (runs - expected) / Math.sqrt(variance);
  const pValue = 2 * (1 - normalCDF(Math.abs(z)));
  return { expected, variance, z, pValue, degenerate };
}

// ── Normal quantile (Wichura AS 241 / PPND16) and derived critical values ──────

/** Inverse standard-normal CDF. */
export function normalQuantile(p: number): number {
  if (!(p > 0 && p < 1)) return NaN;
  const q = p - 0.5;
  let r: number;
  if (Math.abs(q) <= 0.425) {
    r = 0.180625 - q * q;
    return q * (((((((2509.0809287301226727 * r + 33430.575583588128105) * r + 67265.770927008700853) * r + 45921.953931549871457) * r + 13731.693765509461125) * r + 1971.5909503065514427) * r + 133.14166789178437745) * r + 3.387132872796366608)
      / (((((((5226.495278852545925 * r + 28729.085735721942674) * r + 39307.89580009271061) * r + 21213.794301586595867) * r + 5394.1960214247511077) * r + 687.1870074920579083) * r + 42.313330701600911252) * r + 1);
  }
  r = q < 0 ? p : 1 - p;
  r = Math.sqrt(-Math.log(r));
  let val: number;
  if (r <= 5) {
    r -= 1.6;
    val = (((((((7.7454501427834140764e-4 * r + 0.0227238449892691845833) * r + 0.24178072517745061177) * r + 1.27045825245236838258) * r + 3.64784832476320460504) * r + 5.7694972214606914055) * r + 4.6303378461565452959) * r + 1.42343711074968357734)
      / (((((((1.05075007164441684324e-9 * r + 5.475938084995344946e-4) * r + 0.0151986665636164571966) * r + 0.14810397642748007459) * r + 0.68976733498510000455) * r + 1.6763848301838038494) * r + 2.05319162663775882187) * r + 1);
  } else {
    r -= 5;
    val = (((((((2.01033439929228813265e-7 * r + 2.71155556874348757815e-5) * r + 0.0012426609473880784386) * r + 0.026532189526576123093) * r + 0.29656057182850489123) * r + 1.7848265399172913358) * r + 5.4637849111641143699) * r + 6.6579046435011037772)
      / (((((((2.04426310338993978564e-15 * r + 1.4215117583164458887e-7) * r + 1.8463183175100546818e-5) * r + 7.868691311456132591e-4) * r + 0.0148753612908506148525) * r + 0.13692988092273580531) * r + 0.59983220655588793769) * r + 1);
  }
  return q < 0 ? -val : val;
}

/** Two-sided critical |z| at level alpha (the α/2 upper quantile). */
export function inverseCriticalZ(alpha: number): number {
  return -normalQuantile(alpha / 2);
}

/** Two-sided normal tail p for a z-score. */
export function twoSidedNormalP(z: number): number {
  return 2 * (1 - normalCDF(Math.abs(z)));
}

/** One-sided lower-tail normal p: P(Z ≤ z). */
export function normalLowerTailP(z: number): number {
  return normalCDF(z);
}

// ── One-sample Kolmogorov–Smirnov against a supplied CDF ───────────────────────

export interface KsResult { ks: number; pValue: number; n: number; }

/** One-sample KS test of `samples` against a theoretical CDF; asymptotic p (valid for n ≳ 40). */
export function ksTest(samples: number[], cdf: (x: number) => number): KsResult {
  const n = samples.length;
  if (n === 0) return { ks: 0, pValue: 1, n };
  const sorted = [...samples].sort((a, b) => a - b);
  let d = 0;
  for (let i = 0; i < n; i++) {
    const f = cdf(sorted[i]);
    d = Math.max(d, Math.abs((i + 1) / n - f), Math.abs(f - i / n));
  }
  const en  = Math.sqrt(n);
  const lam = (en + 0.12 + 0.11 / en) * d;
  let sum = 0;
  for (let j = 1; j <= 100; j++) {
    const term = 2 * ((j % 2 === 1) ? 1 : -1) * Math.exp(-2 * lam * lam * j * j);
    sum += term;
    if (Math.abs(term) < 1e-12) break;
  }
  return { ks: d, pValue: Math.min(1, Math.max(0, sum)), n };
}

// ── Regularized incomplete gamma (exact) ──────────────────────────────────────

/**
 * Regularized lower incomplete gamma P(a, x) = γ(a,x)/Γ(a).
 * Uses series expansion for x < a+1, continued fraction for x >= a+1.
 * Accuracy: ~14 significant digits (Lanczos log-Γ + series/CF).
 */
function regularizedGamma(a: number, x: number): number {
  if (x < 0) return 0;
  if (x === 0) return 0;
  if (x < a + 1) return gammaSeries(a, x);
  return 1 - gammaCF(a, x);
}

export function logGamma(z: number): number {
  // Lanczos approximation, g=7, n=9
  const c = [
     0.99999999999980993,
    676.5203681218851,
   -1259.1392167224028,
    771.32342877765313,
   -176.61502916214059,
     12.507343278686905,
     -0.13857109526572012,
      9.9843695780195716e-6,
      1.5056327351493116e-7,
  ];
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }
  z -= 1;
  let x = c[0];
  for (let i = 1; i < 9; i++) x += c[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function gammaSeries(a: number, x: number): number {
  const lnGa = logGamma(a);
  let ap  = a;
  let del = 1 / a;
  let sum = del;
  for (let n = 0; n < 300; n++) {
    ap++;
    del *= x / ap;
    sum += del;
    if (Math.abs(del) < Math.abs(sum) * 3e-14) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - lnGa);
}

function gammaCF(a: number, x: number): number {
  const lnGa = logGamma(a);
  let b  = x + 1 - a;
  let c  = 1 / 1e-30;
  let d  = 1 / b;
  let h  = d;
  for (let i = 1; i <= 300; i++) {
    const an = -i * (i - a);
    b += 2;
    d  = an * d + b; if (Math.abs(d) < 1e-30) d = 1e-30;
    c  = b + an / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    d  = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 3e-14) break;
  }
  return Math.exp(-x + a * Math.log(x) - lnGa) * h;
}

// ── Lag-1 autocorrelation ─────────────────────────────────────────────────────

export function lagOneAutocorrelation(series: number[]): number {
  const n    = series.length;
  const mean = series.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n - 1; i++) num += (series[i] - mean) * (series[i + 1] - mean);
  for (let i = 0; i < n; i++)     den += (series[i] - mean) ** 2;
  return den === 0 ? 0 : num / den;
}

// ── Wald-Wolfowitz runs test ──────────────────────────────────────────────────

export interface RunsTestResult {
  runs: number;
  expectedRuns: number;
  zScore: number;
  pValue: number;
}

export function waldsWolfowitzRunsTest(series: number[]): RunsTestResult {
  const med = median(series);
  const bitmask = series.map(v => v >= med ? 1 : 0);
  const n1 = bitmask.filter(v => v === 1).length;
  const n2 = bitmask.length - n1;
  let runs = 1;
  for (let i = 1; i < bitmask.length; i++) {
    if (bitmask[i] !== bitmask[i - 1]) runs++;
  }
  const n = n1 + n2;
  const expectedRuns  = (2 * n1 * n2) / n + 1;
  const varRuns       = (2 * n1 * n2 * (2 * n1 * n2 - n)) / (n * n * (n - 1));
  const zScore        = varRuns > 0 ? (runs - expectedRuns) / Math.sqrt(varRuns) : 0;
  const pValue        = 2 * (1 - normalCDF(Math.abs(zScore)));
  return { runs, expectedRuns, zScore, pValue };
}

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid    = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function normalCDF(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

function erf(x: number): number {
  // Abramowitz & Stegun approximation, max error < 1.5e-7
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t
    - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return Math.sign(x) * y;
}
