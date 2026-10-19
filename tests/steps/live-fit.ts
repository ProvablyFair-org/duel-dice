/**
 * Step 21: Live-Sample Fit (DICE-22) — INFORMATIONAL.
 *
 * A distributional read of the 6,700 CAPTURED rolls: do they fit the uniform lattice, and is the
 * draw stream serially independent in capture order? This is deliberately verdict-light. The
 * distribution is proven EXACTLY, not statistically, by Step 5's per-bet recomputation from
 * (serverSeed, clientSeed, nonce) and by the 2,000,000-draw simulation census (Step 16); a
 * 6,700-roll sample has little power and is not the evidence the verdict rests on. So a deviation
 * here is REPORTED as INFO — never a FLAG, never a FAIL, never counted, verdict unchanged (profile
 * policy INFORMATIONAL, adopted 2026-09-29) — for a human to investigate. On the honest capture the
 * sample fits and the step PASSES.
 *
 * WHY IT IS STILL A SCORED STEP — AND STILL FALSIFIABLE. An informational step that could never go
 * red would be indistinguishable from `return PASS`. It earns its place because its STATISTICS
 * react to the sample: a mutation that corrupts the captured rolls (compresses their range, or
 * orders them) trips the step's own thresholds, it prints [INFO], and the run exits non-zero — the
 * mutation battery's kill condition for a verdict-light step (ported from HouseBets Steps 11 & 13,
 * which solved exactly this). The step proves the distribution REACTS to a bad sample rather than
 * rubber-stamping any.
 *
 *   • Kolmogorov–Smirnov of the rolls against the discrete-uniform CDF F(r) = (r+1)/RANGE.
 *   • Lag-1 autocorrelation of the roll stream in capture order (|z| < 3).
 *   • Wald–Wolfowitz runs test about the roll median (p ≥ 0.01).
 */

import type { StepResult } from './context';
import { step, VerifyContext } from './context';
import { RANGE } from '../../src/rng';
import { ksTest, lagOneAutocorrelation, waldsWolfowitzRunsTest } from '../../src/stats';

export function run(ctx: VerifyContext): StepResult[] {
  const rolls = ctx.bets.map(b => b.response.result);
  const n = rolls.length;

  // KS vs the discrete-uniform CDF on the 0..RANGE-1 lattice.
  const { ks, pValue: ksP } = ksTest(rolls, r => Math.min(1, Math.max(0, (r + 1) / RANGE)));
  const ksOk = ksP > 0.05;

  // Serial independence in capture order.
  const lag1R = lagOneAutocorrelation(rolls);
  const lag1Z = lag1R * Math.sqrt(n);
  const serialOk = Math.abs(lag1Z) < 3;
  const runs = waldsWolfowitzRunsTest(rolls);
  const runsOk = runs.pValue >= 0.01;

  const ok = ksOk && serialOk && runsOk;
  // Informational: a deviation is reported as INFO (not counted, verdict unchanged), never a FLAG or
  // a hard fail — the distribution is proven deterministically by Step 5, this is a cross-check.
  const s21 = step(21, 'Live-Sample Fit (informational)',
    ok ? 'PASS' : 'INFO',
    ok
      ? `${n} captured rolls fit the uniform lattice and show no serial dependence (informational — `
        + `the distribution is proven exactly by Step 5's recomputation and the 2M-draw census, Step 16): `
        + `KS vs Uniform[0,${RANGE - 1}] D=${ks.toFixed(4)} p=${ksP.toFixed(4)} (>0.05); lag-1 z=${lag1Z.toFixed(3)} (|z|<3); `
        + `runs p=${runs.pValue.toFixed(4)} (≥0.01)`
      : `LIVE-SAMPLE DEVIATION (INFO, informational — reported, not counted, verdict unchanged): `
        + `KS D=${ks.toFixed(4)} p=${ksP.toFixed(4)}${ksOk ? '' : ' <0.05'}; lag-1 z=${lag1Z.toFixed(3)}${serialOk ? '' : ' |z|>=3'}; `
        + `runs p=${runs.pValue.toFixed(4)}${runsOk ? '' : ' <0.01'} — investigate the capture; the distribution itself is proven by Step 5`,
    ok ? undefined : { ksD: ks, ksP, lag1Z, runsP: runs.pValue },
  );

  return [s21];
}
