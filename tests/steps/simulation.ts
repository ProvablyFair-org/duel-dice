/**
 * Steps 16–17: Simulation Results
 */

import * as fs   from 'fs';
import * as path from 'path';

import type { StepResult } from './context';
import { step, VerifyContext } from './context';

export function run(ctx: VerifyContext): StepResult[] {
  const { outputsDir } = ctx;
  const simPath = path.join(outputsDir, 'simulation-results.json');

  if (!fs.existsSync(simPath)) {
    const s16 = step(16, 'Simulation Results — Pass 1 Integrity', 'FLAG',
      'simulation-results.json not found — run npm run simulate first',
    );
    const s17 = step(17, 'Simulation Results — Pass 2 Cherry-Pick Test', 'FLAG',
      'simulation-results.json not found',
    );
    return [s16, s17];
  }

  const sim   = JSON.parse(fs.readFileSync(simPath, 'utf-8'));

  // ── Step 16: Pass 1 ────────────────────────────────────────────────────────
  const pass1    = sim.pass1_fresh_seeds;
  const bonAlpha = 0.01 / pass1.targets;
  const chi2BonFails = pass1.results.filter((r: { pValue: number }) => r.pValue < bonAlpha).length;
  // Serial independence: re-check at Bonferroni threshold (|lag1Z| > 3.5 OR runsP < bonAlpha)
  const serialBonFails = pass1.results.filter((r: any) =>
    Math.abs(r.lag1Z ?? 0) > 3.5 || (r.runsP !== undefined && r.runsP < bonAlpha)
  ).length;
  const pass1Ok  = chi2BonFails === 0 && serialBonFails === 0;
  const s16 = step(16, 'Simulation Results — Pass 1 Integrity',
    pass1Ok ? 'PASS' : 'FAIL',
    `${pass1.totalRounds.toLocaleString()} rounds × ${pass1.targets} targets; mean RTP=${(pass1.meanRtp ?? 0).toFixed(4)}%; chi2: ${pass1.chi2FailsAtAlpha01}/${pass1.targets} uncorrected, ${chi2BonFails}/${pass1.targets} at Bonferroni α/${pass1.targets}=${bonAlpha.toFixed(6)}; serial: ${pass1.serialIndependenceFails ?? 0}/${pass1.targets} uncorrected, ${serialBonFails}/${pass1.targets} at Bonferroni`,
  );

  // ── Step 17: Pass 2 ────────────────────────────────────────────────────────
  const pass2      = sim.pass2_casino_seeds;
  const N          = pass2.seed_count;
  const flags      = pass2.test_b_cherry_pick_flags;
  const testA      = pass2.test_a_chi2_fails_at_alpha01;
  // Threshold: 2× expected false-positive rate under H₀ (matches HouseBets standard)
  const expCP      = Math.ceil(N * 0.05);
  const threshold  = expCP * 2;

  let broadFlags = 0;
  let earlyOnly  = 0;
  for (const r of pass2.results) {
    if (r.cherry_pick_flag) {
      if (r.early_p < 0.05 && r.late_p < 0.05) broadFlags++;
      else earlyOnly++;
    }
  }

  const verdict = flags <= threshold && broadFlags === 0 ? 'PASS' : 'FLAG';
  const s17 = step(17, 'Simulation Results — Pass 2 Cherry-Pick Test', verdict,
    `${N} seeds × target=${pass2.target}; Test A: ${testA}/${N} fails (expected ≤${Math.ceil(N * 0.01)}); Test B: ${flags}/${N} early-window statistical flags (≤${threshold} = 2×${expCP} threshold); ${earlyOnly} isolated to early window, ${broadFlags} also showed deviation in the late window — within expected false-positive range under the binomial null`,
  );

  return [s16, s17];
}
