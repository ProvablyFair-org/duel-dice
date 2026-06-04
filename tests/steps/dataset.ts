/**
 * Steps 11–15: Dataset Integrity & Anti-Circularity
 */

import type { StepResult } from './context';
import { step, VerifyContext } from './context';
import { checkDatasetHash } from '../../src/loader';
import { computeResult, RANGE, MAX_FAIR } from '../../src/rng';

export function run(ctx: VerifyContext): StepResult[] {
  const { bets, phaseD } = ctx;

  // ── Step 11: Phase labels ─────────────────────────────────────────────────────
  const phases    = new Set(bets.map(b => b.phase));
  const hasAll    = ['A', 'B', 'C', 'D'].every(p => phases.has(p));
  const lastPhase = bets[bets.length - 1].phase;
  const s11 = step(11, 'Phase Labels',
    hasAll && lastPhase === 'D' ? 'PASS' : 'FLAG',
    `Phases present: ${[...phases].sort().join(', ')}; last bet phase: ${lastPhase}`,
  );

  // ── Step 12: Dataset hash ─────────────────────────────────────────────────────
  const h  = checkDatasetHash();
  const s12 = step(12, 'Dataset Hash',
    h.match ? 'PASS' : 'FAIL',
    h.expected,
  );

  // ── Step 13: Sampling uniformity — closed-form RTP precondition ───────────────
  // The closed-form house edge (EV = 0.999 for all targets 2–9998) holds iff the
  // rejection-sampling bound is an EXACT multiple of RANGE. If MAX_FAIR % RANGE ≠ 0,
  // residues 0..(MAX_FAIR % RANGE − 1) become over-represented and the per-target
  // win probability deviates from (10000−t)/10001 — breaking the EV proof.
  // We recompute the bound independently and assert it matches src/rng.ts.
  const MAX_FAIR_INDEP = 0xFFFFFFFF - (0xFFFFFFFF % 10001);
  const exactMultiple  = MAX_FAIR_INDEP % 10001 === 0;
  const boundMatches   = MAX_FAIR_INDEP === MAX_FAIR;
  const rangeMatches   = RANGE === 10001;
  const quotient       = MAX_FAIR_INDEP / 10001;
  const s13 = step(13, 'Sampling Uniformity (closed-form RTP precondition)',
    exactMultiple && boundMatches && rangeMatches ? 'PASS' : 'FAIL',
    `MAX_FAIR = ${MAX_FAIR_INDEP} = 10001 × ${quotient} → result exactly uniform on {0..10000}; closed-form EV = 0.999 for all targets 2–9998 follows. ` +
    `Checks: MAX_FAIR % 10001 === 0 (${exactMultiple}); independent bound === src/rng MAX_FAIR (${boundMatches}); RANGE === 10001 (${rangeMatches}).`,
  );

  // ── Step 14: Epoch size ────────────────────────────────────────────────────────
  const epochSizes = new Map<string, number>();
  for (const b of bets) {
    epochSizes.set(b.response.server_seed_hashed, (epochSizes.get(b.response.server_seed_hashed) ?? 0) + 1);
  }
  const sizes   = [...epochSizes.values()];
  const minSize = Math.min(...sizes);
  const maxSize = Math.max(...sizes);
  const s14 = step(14, 'Epoch Size',
    (minSize === 50 && maxSize === 50) ? 'PASS' : 'FLAG',
    `${epochSizes.size} epochs; min=${minSize}, max=${maxSize} bets per epoch`,
  );

  // ── Step 15: Phase D — client seed variation ──────────────────────────────────
  const dClientSeeds = new Set(phaseD.map(b => b.response.client_seed));
  const dTargets     = new Set(phaseD.map(b => b.request.target));
  let dMatched = 0;
  let dTested  = 0;
  for (const b of phaseD) {
    const ss = ctx.seedMap.get(b.response.server_seed_hashed);
    if (!ss) continue;
    dTested++;
    const computed = computeResult(ss, b.response.client_seed, b.response.nonce);
    if (computed === b.response.result) dMatched++;
  }
  const s15 = step(15, 'Phase D — Client Seed Variation',
    dClientSeeds.size >= 2 && dMatched === dTested ? 'PASS' : 'FLAG',
    `${phaseD.length} bets, ${dClientSeeds.size} distinct client seeds, targets: ${[...dTargets].join(', ')}; recomputation: ${dMatched}/${dTested} match`,
  );

  return [s11, s12, s13, s14, s15];
}
