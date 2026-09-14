/**
 * Steps 11–15: Dataset Integrity & Anti-Circularity
 */

import type { StepResult } from './context';
import { step, VerifyContext } from './context';
import {
  checkDatasetHash,
  EXPECTED_BETS, EXPECTED_SEEDS, EXPECTED_EPOCHS, EXPECTED_EPOCH_SIZE, EXPECTED_PHASE_BETS,
} from '../../src/loader';
import { computeResult, RANGE, MAX_FAIR } from '../../src/rng';

export function run(ctx: VerifyContext): StepResult[] {
  const { bets, phaseD } = ctx;

  // ── Step 11: Population & phase labels ────────────────────────────────────────
  // Bound to CODE constants, never to the dataset's own header. The counts come from
  // src/loader.ts; a dataset that disagrees with the capture plan fails here even when
  // its hash pin has been updated to match it.
  const phases    = new Set(bets.map(b => b.phase));
  const hasAll    = ['A', 'B', 'C', 'D'].every(p => phases.has(p));
  const lastPhase = bets[bets.length - 1].phase;

  const phaseCounts: Record<string, number> = {};
  for (const b of bets) phaseCounts[b.phase] = (phaseCounts[b.phase] ?? 0) + 1;
  const phaseBad = Object.entries(EXPECTED_PHASE_BETS)
    .filter(([p, n]) => (phaseCounts[p] ?? 0) !== n)
    .map(([p, n]) => `${p}: ${phaseCounts[p] ?? 0} ≠ ${n}`);
  const extraPhases = Object.keys(phaseCounts).filter(p => !(p in EXPECTED_PHASE_BETS));

  const betsOk   = bets.length === EXPECTED_BETS;
  const seedsOk  = ctx.seeds.length === EXPECTED_SEEDS;
  const popOk    = betsOk && seedsOk && phaseBad.length === 0 && extraPhases.length === 0;

  const s11 = step(11, 'Population & Phase Labels',
    popOk && hasAll && lastPhase === 'D' ? 'PASS' : 'FAIL',
    `${bets.length}/${EXPECTED_BETS} bets and ${ctx.seeds.length}/${EXPECTED_SEEDS} seed records against the capture plan in src/loader.ts (code constants, not the dataset header); ` +
    `per phase ${Object.entries(EXPECTED_PHASE_BETS).map(([p, n]) => `${p}=${phaseCounts[p] ?? 0}/${n}`).join(' ')}; ` +
    `phases present: ${[...phases].sort().join(', ')}; last bet phase: ${lastPhase}` +
    (betsOk ? '' : `; BET COUNT MISMATCH`) +
    (seedsOk ? '' : `; SEED COUNT MISMATCH`) +
    (phaseBad.length ? `; PHASE MISMATCH ${phaseBad.join(', ')}` : '') +
    (extraPhases.length ? `; UNDECLARED PHASE ${extraPhases.join(', ')}` : ''),
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
  // Epoch COUNT as well as epoch size: a uniform 50 across 82 epochs is still a shrunken
  // capture, and size alone cannot see that. Both bound to code constants, and FAIL — the
  // old FLAG let a 4,100-bet forgery exit 0.
  const epochCountOk = epochSizes.size === EXPECTED_EPOCHS;
  const epochSizeOk  = minSize === EXPECTED_EPOCH_SIZE && maxSize === EXPECTED_EPOCH_SIZE;
  const s14 = step(14, 'Epoch Count & Size',
    epochCountOk && epochSizeOk ? 'PASS' : 'FAIL',
    `${epochSizes.size}/${EXPECTED_EPOCHS} epochs carrying bets; min=${minSize}, max=${maxSize} against EXPECTED_EPOCH_SIZE ${EXPECTED_EPOCH_SIZE}; ` +
    `${epochSizes.size} × ${EXPECTED_EPOCH_SIZE} = ${epochSizes.size * EXPECTED_EPOCH_SIZE} bets` +
    (epochCountOk ? '' : `; EPOCH COUNT MISMATCH`) +
    (epochSizeOk ? '' : `; EPOCH SIZE MISMATCH`),
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
