/**
 * Step 20 — Multiplier monotonicity & bounds (DICE-14, FLAG policy).
 *
 * Two properties of the multiplier CURVE, disclosed rather than failed (a violation is a FLAG,
 * not a hard fail):
 *
 *   1. MONOTONICITY. This audit covers roll-over bets only (DL-14): the win chance of a bet is a function of its target
 *      alone, chance(target) = (10000 − target) / 10001, and the served multiplier is
 *      0.999 / chance. Across every DISTINCT win-chance point the capture actually served,
 *      sorting by win chance ascending must give a STRICTLY DECREASING multiplier — a higher
 *      chance of winning must never pay at least as much as a lower one. The multiplier is
 *      RECOMPUTED from the target via src/rng.ts (theoreticalMultiplier), never read from the
 *      operator's response.multiplier field, so the curve being checked is the one the formula
 *      produces, not the one the operator quoted.
 *
 *   2. BOUNDS. Every quoted (operator-served) multiplier lies within the declared odds band
 *      [MIN_ODDS, MAX_ODDS]. Those bounds are derived in src/loader.ts from the valid target band
 *      [TARGET_MIN, TARGET_MAX] and the formula — not from the data — so a multiplier outside them
 *      is a target outside the game's valid domain.
 *
 * Reference: liqd dice Step 21 (distinct-point monotonicity) + Step 10 (odds bounds); housebets
 * dice tests/steps/monotonicity.ts. Adapted to Duel's single over direction and integer targets.
 */

import type { StepResult } from './context';
import { step, VerifyContext } from './context';
import { theoreticalMultiplier, theoreticalWinChance } from '../../src/rng';
import { MIN_ODDS, MAX_ODDS, TARGET_MIN, TARGET_MAX } from '../../src/loader';

export function run(ctx: VerifyContext): StepResult[] {
  const { bets } = ctx;

  // ── Distinct win-chance points actually served, each with its RECOMPUTED multiplier ──────
  // The target is an integer, so chance = (10000 − target) / 10001 is an exact, distinct rational
  // per target — no IEEE-754 collision to quantise around. The key is the target itself; a target
  // that somehow mapped to two different recomputed multipliers (an impossible curve) is caught,
  // not silently deduplicated.
  const byTarget = new Map<number, Set<number>>();
  for (const b of bets) {
    const t    = b.request.target;
    const mult = theoreticalMultiplier(t);
    const set  = byTarget.get(t) ?? new Set<number>();
    set.add(mult);
    byTarget.set(t, set);
  }

  const multivalued = [...byTarget.entries()].filter(([, s]) => s.size !== 1);
  const points = [...byTarget.entries()]
    .map(([t, s]) => ({ chance: theoreticalWinChance(t), mult: [...s][0] }))
    .sort((a, z) => a.chance - z.chance);   // ascending win chance

  // Strict monotone decrease across adjacent distinct chances.
  const inversions: string[] = [];
  for (let i = 1; i < points.length; i++) {
    if (!(points[i].mult < points[i - 1].mult)) {
      inversions.push(
        `chance ${points[i - 1].chance.toFixed(6)}→${points[i].chance.toFixed(6)}: ` +
        `mult ${points[i - 1].mult}→${points[i].mult} (not strictly decreasing)`,
      );
    }
  }

  // ── Bounds: every quoted multiplier within [MIN_ODDS, MAX_ODDS] ──────────────────────────
  // The QUOTED field is the operator's served response.multiplier (an 18-dp string), checked for
  // every bet — the offered odds are present on wins and losses alike.
  const outOfBounds: string[] = [];
  let quotedChecked = 0;
  for (const b of bets) {
    const q = parseFloat(b.response.multiplier);
    if (!Number.isFinite(q)) continue;
    quotedChecked++;
    if (q < MIN_ODDS || q > MAX_ODDS) {
      outOfBounds.push(`nonce=${b.response.nonce} target=${b.request.target}: quoted ${q} ∉ [${MIN_ODDS}, ${MAX_ODDS}]`);
    }
  }

  const ok = points.length > 0 && quotedChecked > 0
    && multivalued.length === 0 && inversions.length === 0 && outOfBounds.length === 0;

  const detail =
    points.length === 0 || quotedChecked === 0
      ? 'COVERAGE FAIL: no distinct win-chance points or no quoted multipliers to check.'
      : `${points.length} distinct win-chance points (recomputed multiplier a strict function of the target): ` +
        `${inversions.length} monotonicity inversions, ${multivalued.length} targets mapping to >1 multiplier; ` +
        `${quotedChecked} quoted multipliers checked against the declared odds band ` +
        `[${MIN_ODDS}, ${MAX_ODDS}] (from the target band ${TARGET_MIN}..${TARGET_MAX}, src/loader.ts): ` +
        `${outOfBounds.length} out of bounds` +
        (inversions.length ? `. Inversions: ${inversions.slice(0, 3).join('; ')}` : '') +
        (outOfBounds.length ? `. Out-of-bounds: ${outOfBounds.slice(0, 3).join('; ')}` : '') +
        (multivalued.length ? `. Multi-valued targets: ${multivalued.slice(0, 3).map(([t]) => t).join(', ')}` : '');

  // FLAG policy (DICE-14): a violation is disclosed, not a hard fail. A real curve defect is about
  // the game, so it would carry operator origin and downgrade the verdict to Conditional Pass.
  return [step(20, 'Multiplier Monotonicity & Bounds', ok ? 'PASS' : 'FLAG', detail,
    {
      distinctPoints: points.length,
      inversions: inversions.length,
      multivaluedTargets: multivalued.length,
      quotedChecked,
      outOfBounds: outOfBounds.length,
      minOdds: MIN_ODDS,
      maxOdds: MAX_ODDS,
    })];
}
