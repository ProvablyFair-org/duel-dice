/**
 * Duel.com Dice — VALUE DOMAINS for every numeric leaf of the committed artifacts of record
 * (`outputs/simulation-results.json`, `outputs/chi-squared-results.json`,
 * `outputs/determinism-log.json`).
 *
 * ── Why this module exists ───────────────────────────────────────────────────────────────────────
 * Ported from the sibling liqd-plinko / liqd-dice `src/domains.ts`. There, setting a committed
 * emission artifact's count field to a physically impossible value (e.g. −1) printed a clean Full
 * Pass: the SHA-256 pin only proves the bytes have not moved since WE pinned them, and a forger who
 * doctors a scalar re-pins the file in the same commit — which is exactly what re-pinning is for.
 * The framework's `gate-values.sh` grades a pin-only rejection of an impossible value as a failure,
 * correctly.
 *
 * The fix is one rule, and it is the only rule that matters:
 *
 *     EVERY BOUND IS DERIVED FROM src/ (the audited population in src/loader.ts, the RNG grid in
 *     src/rng.ts, the frozen simulation design below) — NEVER FROM THE ARTIFACT BEING CHECKED. A
 *     bound the artifact supplies is a bound a forger sets.
 *
 * ── G-VALID: reject only the IMPOSSIBLE ──────────────────────────────────────────────────────────
 * The mirror defect costs exactly as much: a GENUINE result rejected for being surprising trains a
 * reader to re-run until green. So these domains encode PHYSICAL POSSIBILITY, not plausibility, and
 * nothing here rejects a value for being round, extreme, or equal to its own expectation. Honest
 * committed values in this game's artifacts that a naive name-based classifier would get wrong:
 *
 *   pass1.results[].rtpSnapshots[].rtp = 107.40   a WINDOW RTP legitimately ABOVE 100% — a short
 *                                                 window mean is bounded by the paytable's largest
 *                                                 multiplier (as a percent), not by 100
 *   pass1.results[].lag1R = 0.0017…               an autocorrelation, so [-1, 1] and often negative
 *   pass1.results[].lag1Z = 1.70…                 a signed z-score, unbounded either way
 *
 * Because a mistake in this table would either wave through a forgery or reject an honest audit,
 * Step 12 (`tests/steps/dataset.ts`) asserts BOTH directions against the committed artifacts on
 * every run: every numeric leaf satisfies its domain, AND every numeric leaf PATH is covered by an
 * explicit rule. There is no silent fallback — a new numeric field with no declared domain FAILS
 * Step 12, so the class cannot reopen quietly.
 */

import { RANGE } from './rng';
import {
  EXPECTED_BETS, EXPECTED_SEEDS, EXPECTED_EPOCH_SIZE,
  TARGET_MIN, TARGET_MAX, MIN_ODDS, MAX_ODDS,
} from './loader';
import {
  SIM_UNIFORMITY_DRAWS, SIM_UNIFORMITY_BINS, SIM_EDGE_BETS, SIM_EDGE_BANDS,
  SIM_PASS2_NONCES, SIM_PASS2_EARLY_WINDOW, THEORETICAL_RTP,
} from './sim-config';

// ── Frozen simulation design ──────────────────────────────────────────────────────────────────────
// The Monte-Carlo run in src/simulate.ts is frozen — its artifact is pinned and never regenerated on
// the default path. Its design parameters live in src/sim-config.ts, cited here so a leaf that
// echoes the design (draws, bins, bets, nonces) is checked against source rather than against itself.
export const SIM_PASS2_REF_WINDOW = SIM_PASS2_NONCES - SIM_PASS2_EARLY_WINDOW;

export interface Domain {
  readonly label: string;
  readonly ok: (v: number) => boolean;
}

const D = (label: string, ok: (v: number) => boolean): Domain => ({ label, ok });

// ── Primitive domains ────────────────────────────────────────────────────────────────────────────

/** Any real number that is not NaN/Infinity. The weakest domain; used only where the quantity
 *  genuinely has no physical bound (signed z-scores). */
export const FINITE = D('a finite number', v => Number.isFinite(v));
export const NONNEG_REAL = D('a non-negative real', v => Number.isFinite(v) && v >= 0);
export const NONNEG_INT = D('a non-negative integer', v => Number.isInteger(v) && v >= 0);
export const POSITIVE_INT = D('a positive integer', v => Number.isInteger(v) && v >= 1);
export const PROBABILITY = D('a probability in [0,1]', v => Number.isFinite(v) && v >= 0 && v <= 1);
export const CORRELATION = D('a correlation in [-1,1]', v => Number.isFinite(v) && v >= -1 && v <= 1);
/** A chi-squared statistic is a sum of squares over positive expectations. */
export const CHI_SQUARED = D('a non-negative chi-squared statistic', v => Number.isFinite(v) && v >= 0);

export const exactly = (target: number, what: string): Domain =>
  D(`exactly ${target} (${what})`, v => v === target);

export const intAtMost = (max: number, what: string): Domain =>
  D(`an integer in [0, ${max}] (${what})`, v => Number.isInteger(v) && v >= 0 && v <= max);

export const intBetween = (lo: number, hi: number, what: string): Domain =>
  D(`an integer in [${lo}, ${hi}] (${what})`, v => Number.isInteger(v) && v >= lo && v <= hi);

export const realBetween = (lo: number, hi: number, what: string): Domain =>
  D(`a real in [${lo}, ${hi}] (${what})`, v => Number.isFinite(v) && v >= lo && v <= hi);

// ── Derived domains — bounds from src/, never from a scored artifact ───────────────────────────────

const TARGET = intBetween(TARGET_MIN, TARGET_MAX, 'a valid over-bet target');
const SEED_COUNT = intBetween(1, EXPECTED_SEEDS, 'a count within the audited seed population');
const BET_COUNT = intBetween(0, EXPECTED_BETS, 'a count within the audited bet population');
const CONVERGENCE_MARK = intBetween(1, SIM_EDGE_BETS, 'a per-band cumulative bet mark');
const EDGE_WIN_COUNT = intBetween(0, SIM_EDGE_BETS, 'a win count within a per-band edge run');
const UNIFORMITY_BIN = intBetween(0, SIM_UNIFORMITY_DRAWS, 'a histogram bin count within the draw census');
const SEED_FLAG_COUNT = intBetween(0, EXPECTED_SEEDS, 'a per-seed direction count');
/**
 * The attainable range of any RTP expressed as a PERCENT. A mean of drawn multipliers cannot fall
 * outside 0 and the largest multiplier the game can pay (MAX_ODDS), and here it is scaled ×100 to a
 * percent. NOT [0,100]: a short window legitimately averages above 100%. */
const RTP_PCT = realBetween(0, MAX_ODDS * 100, 'an attainable payout average as a percent');
/** A payout-weighted return over a window of bets: non-negative, bounded above by the largest
 *  multiplier times the number of bets — but NONNEG_REAL is the physical floor that matters. */
const RETURN = NONNEG_REAL;

// ── The rule table ────────────────────────────────────────────────────────────────────────────────

export interface Rule {
  /** Matches a COLLAPSED leaf path: array indices are rendered as `[]`. */
  readonly path: RegExp;
  readonly domain: Domain;
}

/** Collapse `a.b[3].c` to `a.b[].c` so one rule covers every element of a list. */
export function collapsePath(path: string): string {
  return path.replace(/\[\d+\]/g, '[]');
}

/**
 * Every numeric leaf of each committed artifact, with the domain it physically admits.
 * Ordering matters: the FIRST matching rule wins, so narrower (anchored) patterns come first.
 */
export function domainRules(): Record<string, Rule[]> {
  return {
    // ── outputs/simulation-results.json ────────────────────────────────────────────────────────────
    'simulation-results.json': [
      // model
      { path: /^\.model\.range$/, domain: exactly(RANGE, 'RANGE') },
      { path: /^\.model\.houseEdge$/, domain: realBetween(0, 0.5, 'a house-edge fraction') },

      // pass 1 — uniformity census + edge convergence
      { path: /^\.pass1\.alpha$/, domain: PROBABILITY },
      { path: /^\.pass1\.alphaScreen$/, domain: PROBABILITY },
      { path: /^\.pass1\.bands$/, domain: exactly(SIM_EDGE_BANDS, 'SIM_EDGE_BANDS') },
      { path: /^\.pass1\.betsPerBand$/, domain: exactly(SIM_EDGE_BETS, 'SIM_EDGE_BETS') },
      { path: /^\.pass1\.meanRtp$/, domain: RTP_PCT },

      { path: /^\.pass1\.uniformity\.draws$/, domain: exactly(SIM_UNIFORMITY_DRAWS, 'SIM_UNIFORMITY_DRAWS') },
      { path: /^\.pass1\.uniformity\.bins$/, domain: exactly(SIM_UNIFORMITY_BINS, 'SIM_UNIFORMITY_BINS') },
      { path: /^\.pass1\.uniformity\.n$/, domain: exactly(SIM_UNIFORMITY_DRAWS, 'SIM_UNIFORMITY_DRAWS') },
      { path: /^\.pass1\.uniformity\.df$/, domain: exactly(SIM_UNIFORMITY_BINS - 1, 'bins − 1') },
      { path: /^\.pass1\.uniformity\.histogram\[\]$/, domain: UNIFORMITY_BIN },
      { path: /^\.pass1\.uniformity\.chi2$/, domain: CHI_SQUARED },
      { path: /^\.pass1\.uniformity\.pValue$/, domain: PROBABILITY },
      { path: /^\.pass1\.uniformity\.rollMin$/, domain: intBetween(0, RANGE - 1, 'a roll on the lattice') },
      { path: /^\.pass1\.uniformity\.rollMax$/, domain: intBetween(0, RANGE - 1, 'a roll on the lattice') },
      { path: /^\.pass1\.uniformity\.serial\.n$/, domain: exactly(SIM_UNIFORMITY_DRAWS, 'SIM_UNIFORMITY_DRAWS') },
      { path: /^\.pass1\.uniformity\.serial\.lag1$/, domain: CORRELATION },
      { path: /^\.pass1\.uniformity\.serial\.lag1Z$/, domain: FINITE },
      { path: /^\.pass1\.uniformity\.serial\.runs$/, domain: intBetween(1, SIM_UNIFORMITY_DRAWS, 'a run count') },
      { path: /^\.pass1\.uniformity\.serial\.n1$/, domain: intBetween(0, SIM_UNIFORMITY_DRAWS, 'a count above the split') },
      { path: /^\.pass1\.uniformity\.serial\.runsZ$/, domain: FINITE },
      { path: /^\.pass1\.uniformity\.serial\.runsP$/, domain: PROBABILITY },

      { path: /^\.pass1\.edge\[\]\.target$/, domain: TARGET },
      { path: /^\.pass1\.edge\[\]\.theoreticalWinChance$/, domain: PROBABILITY },
      { path: /^\.pass1\.edge\[\]\.n$/, domain: exactly(SIM_EDGE_BETS, 'SIM_EDGE_BETS') },
      { path: /^\.pass1\.edge\[\]\.wins$/, domain: EDGE_WIN_COUNT },

      { path: /^\.pass1\.convergence\[\]\.roundCount$/, domain: CONVERGENCE_MARK },
      { path: /^\.pass1\.convergence\[\]\.meanRTP$/, domain: RTP_PCT },
      { path: /^\.pass1\.convergence\[\]\.stdDev$/, domain: NONNEG_REAL },

      // pass 2 — served-band cherry-pick, exact per-bet moments + normal (CLT) lower-tail
      { path: /^\.pass2\.nonces$/, domain: exactly(SIM_PASS2_NONCES, 'SIM_PASS2_NONCES') },
      { path: /^\.pass2\.earlyWindow$/, domain: exactly(SIM_PASS2_EARLY_WINDOW, 'SIM_PASS2_EARLY_WINDOW') },
      { path: /^\.pass2\.alpha$/, domain: PROBABILITY },
      { path: /^\.pass2\.epochs$/, domain: SEED_COUNT },
      { path: /^\.pass2\.totalEarlyReturn$/, domain: RETURN },
      { path: /^\.pass2\.totalEarlyExpected$/, domain: RETURN },
      { path: /^\.pass2\.totalEarlyVar$/, domain: NONNEG_REAL },
      { path: /^\.pass2\.aggEarlyZ$/, domain: FINITE },
      { path: /^\.pass2\.aggEarlyP$/, domain: PROBABILITY },
      { path: /^\.pass2\.directionBelow$/, domain: SEED_FLAG_COUNT },
      { path: /^\.pass2\.directionAbove$/, domain: SEED_FLAG_COUNT },
      { path: /^\.pass2\.minDetectableReturnShift$/, domain: NONNEG_REAL },
      { path: /^\.pass2\.minDetectablePerBetPct$/, domain: NONNEG_REAL },
      { path: /^\.pass2\.perEpoch\[\]\.earlyN$/, domain: exactly(SIM_PASS2_EARLY_WINDOW, 'SIM_PASS2_EARLY_WINDOW') },
      { path: /^\.pass2\.perEpoch\[\]\.earlyReturn$/, domain: RETURN },
      { path: /^\.pass2\.perEpoch\[\]\.earlyExpected$/, domain: RETURN },
      { path: /^\.pass2\.perEpoch\[\]\.earlyVar$/, domain: NONNEG_REAL },
      { path: /^\.pass2\.perEpoch\[\]\.refN$/, domain: exactly(SIM_PASS2_REF_WINDOW, 'reference window size') },
      { path: /^\.pass2\.perEpoch\[\]\.refReturn$/, domain: RETURN },
      { path: /^\.pass2\.perEpoch\[\]\.refExpected$/, domain: RETURN },
      { path: /^\.pass2\.perEpoch\[\]\.refVar$/, domain: NONNEG_REAL },
    ],

    // ── outputs/chi-squared-results.json ───────────────────────────────────────────────────────────
    'chi-squared-results.json': [
      { path: /^\.groups\[\]\.target$/, domain: TARGET },
      { path: /^\.groups\[\]\.wins$/, domain: BET_COUNT },
      { path: /^\.groups\[\]\.total$/, domain: intBetween(1, EXPECTED_BETS, 'a group size within the audited bet population') },
      { path: /^\.groups\[\]\.theor$/, domain: PROBABILITY },
      { path: /^\.groups\[\]\.pValue$/, domain: PROBABILITY },
    ],

    // ── outputs/determinism-log.json ───────────────────────────────────────────────────────────────
    'determinism-log.json': [
      { path: /^\.verified$/, domain: BET_COUNT },
      { path: /^\.mismatches$/, domain: BET_COUNT },
      { path: /^\.skipped$/, domain: BET_COUNT },
    ],
  };
}

export interface DomainViolation {
  path: string;
  value: number;
  expected: string;
}

/** Collect every numeric leaf of `doc` as `[collapsedPath, value]`. */
export function numericLeaves(doc: unknown, path = '', out: [string, number][] = []): [string, number][] {
  if (typeof doc === 'number') { out.push([collapsePath(path), doc]); return out; }
  if (doc === null || typeof doc !== 'object') return out;
  if (Array.isArray(doc)) {
    doc.forEach((v, i) => numericLeaves(v, `${path}[${i}]`, out));
    return out;
  }
  for (const [k, v] of Object.entries(doc as Record<string, unknown>)) numericLeaves(v, `${path}.${k}`, out);
  return out;
}

/**
 * Validate every numeric leaf of `doc` against `rules`.
 *
 * A leaf matched by NO rule is a violation in its own right (`uncovered`). That is deliberate: an
 * unbounded new field is precisely how this class reopens, and a silent fallback to "must be finite"
 * would have accepted the impossible.
 */
export function validateDomains(doc: unknown, rules: Rule[]): { violations: DomainViolation[]; uncovered: string[]; checked: number } {
  const violations: DomainViolation[] = [];
  const uncovered: string[] = [];
  const leaves = numericLeaves(doc);
  for (const [p, v] of leaves) {
    const rule = rules.find(r => r.path.test(p));
    if (!rule) {
      if (!uncovered.includes(p)) uncovered.push(p);
      continue;
    }
    if (!rule.domain.ok(v)) violations.push({ path: p, value: v, expected: rule.domain.label });
  }
  return { violations, uncovered, checked: leaves.length };
}

/** One-line summaries for a step's detail string. */
export function describeDomainFailures(artifact: string, r: { violations: DomainViolation[]; uncovered: string[] }): string[] {
  const out: string[] = [];
  for (const v of r.violations.slice(0, 4)) {
    out.push(`${artifact}${v.path} = ${v.value} is not ${v.expected}`);
  }
  if (r.violations.length > 4) out.push(`${artifact}: +${r.violations.length - 4} more impossible value(s)`);
  for (const p of r.uncovered.slice(0, 4)) {
    out.push(`${artifact}${p} has no declared value domain (add one in src/domains.ts)`);
  }
  if (r.uncovered.length > 4) out.push(`${artifact}: +${r.uncovered.length - 4} more undeclared field(s)`);
  return out;
}
