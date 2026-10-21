/**
 * Step 18: Configuration Coverage — target space, stake levels, direction mode (DICE-15)
 *
 * Dice's primary configuration dimension is `target`, an integer over 2…9998 (src/loader.ts) that sets both the
 * win chance and the multiplier. Every other scored step verifies the FORMULA — win chance,
 * multiplier, payout, the RTP identity — and the formula steps are exhaustive by construction, so
 * they say nothing about whether the live capture actually spanned the dimension. A capture that
 * only ever bet target=9800 would satisfy all of them.
 *
 * This step measures the span and holds it to a floor, on all three coverage dimensions the
 * profile names, each asserted against a plan pinned in src/loader.ts rather than described in
 * prose:
 *
 *   • TARGET SPACE — divided into ten 1000-wide bands spanning both ends of 2…9998; each band must
 *     carry at least MIN_BETS_PER_TARGET_BAND bets, so a band reduced to a token sample fails.
 *   • STAKE LEVELS — both declared stake levels (the $0.01 base and the $10 elevated stake) must
 *     each carry at least MIN_BETS_PER_STAKE_TIER bets. A capture that dropped the elevated level
 *     would leave bet-size invariance (Step 7 / DICE-12) with nothing to test. (The constant names
 *     keep "TIER"; these are the capture's two stake levels, not Duel's edge tiers. Both levels are
 *     in Duel's 0.1 % edge tier; the scaled edge tiers are not covered, DL-15.)
 *   • DIRECTION MODE — Duel Dice offers "over" and "under"; this capture and this verifier cover
 *     "over" only, so DECLARED_DIRECTION_MODES is the audited mode set {over}. The set of bet_type
 *     values in the capture must equal it exactly: every audited mode exercised, and NO other mode
 *     present — because the whole verifier is written for the over rule, an "under" bet would be
 *     scored by the wrong rule. Roll-under is not covered by this audit (DL-14).
 *
 * The step also reports how many distinct targets live play exercised and, for completeness, the
 * share of the theoretical return that sits on the targets it never touched — which is zero in
 * the 0.1 % edge tier, because there the RTP identity is flat at 0.999 across the whole target range
 * and is proven analytically over all 9,997 legal targets in Step 13. What an unexercised target lacks is a live observation of its
 * multiplier, not a verified return.
 */

import type { StepResult } from './context';
import { step, VerifyContext } from './context';
import {
  TARGET_MIN, TARGET_MAX, TARGET_BANDS, MIN_BETS_PER_TARGET_BAND,
  EXPECTED_STAKE_TIERS, MIN_BETS_PER_STAKE_TIER, DECLARED_DIRECTION_MODES,
} from '../../src/loader';
import { theoreticalWinChance, theoreticalMultiplier } from '../../src/rng';

export function run(ctx: VerifyContext): StepResult[] {
  const { bets } = ctx;

  const bandWidth = Math.ceil((TARGET_MAX - TARGET_MIN + 1) / TARGET_BANDS);
  const bandOf = (t: number) =>
    Math.min(TARGET_BANDS - 1, Math.max(0, Math.floor((t - TARGET_MIN) / bandWidth)));

  const bandCounts: number[] = new Array(TARGET_BANDS).fill(0);
  const distinctTargets = new Set<number>();
  const outOfRange: string[] = [];

  for (const b of bets) {
    const t = b.request.target;
    if (t < TARGET_MIN || t > TARGET_MAX) {
      outOfRange.push(`bet ${b.response.id}: target ${t} outside ${TARGET_MIN}–${TARGET_MAX}`);
      continue;
    }
    distinctTargets.add(t);
    bandCounts[bandOf(t)]++;
  }

  const failures: string[] = [...outOfRange];
  const bandDetail: Record<string, number> = {};
  for (let i = 0; i < TARGET_BANDS; i++) {
    const lo = TARGET_MIN + i * bandWidth;
    const hi = Math.min(TARGET_MAX, lo + bandWidth - 1);
    bandDetail[`${lo}-${hi}`] = bandCounts[i];
    if (bandCounts[i] < MIN_BETS_PER_TARGET_BAND) {
      failures.push(`targets ${lo}–${hi}: ${bandCounts[i]} bets (floor ${MIN_BETS_PER_TARGET_BAND})`);
    }
  }

  // The step CLAIMS that unexercised targets carry no unverified return, which is only
  // true while the RTP identity is flat across the whole range. Measure it here rather
  // than taking Step 13's word for it, and fail on the claim as well as on the floor —
  // a step that asserts something it has not checked is decoration.
  const RTP_FLATNESS_BOUND = 1e-9;
  let maxRtpSpread = 0;
  for (let t = TARGET_MIN; t <= TARGET_MAX; t++) {
    const rtp = theoreticalWinChance(t) * theoreticalMultiplier(t);
    const spread = Math.abs(rtp - 0.999);
    if (spread > maxRtpSpread) maxRtpSpread = spread;
  }
  if (maxRtpSpread > RTP_FLATNESS_BOUND) {
    failures.push(
      `theoretical RTP is not flat across ${TARGET_MIN}–${TARGET_MAX} (spread beyond the `
      + `${RTP_FLATNESS_BOUND.toExponential(0)} bound) — the unexercised targets cannot be `
      + `dismissed as carrying no unverified return`,
    );
  }

  const totalTargets = TARGET_MAX - TARGET_MIN + 1;
  const coverageShare = distinctTargets.size / totalTargets;

  // ── Stake-level coverage (DICE-15) ────────────────────────────────────────────
  // Each declared stake level must carry its floor of bets. A bet counts toward a level if its stake
  // matches within a relative epsilon (the stakes are exact strings "0.01"/"10", so this is a
  // guard against float formatting, not a tolerance on the plan). The count of bets whose stake
  // matches NO declared level is reported too — an undeclared stake level is a coverage gap.
  const stakeCounts: Record<string, number> = {};
  for (const t of EXPECTED_STAKE_TIERS) stakeCounts[String(t)] = 0;
  let undeclaredStakeBets = 0;
  for (const b of bets) {
    const amt   = parseFloat(b.request.amount);
    const tier  = EXPECTED_STAKE_TIERS.find(t => Math.abs(amt - t) <= 1e-9 + 1e-9 * Math.abs(t));
    if (tier === undefined) undeclaredStakeBets++;
    else stakeCounts[String(tier)]++;
  }
  for (const t of EXPECTED_STAKE_TIERS) {
    const got = stakeCounts[String(t)];
    if (got < MIN_BETS_PER_STAKE_TIER) {
      failures.push(`stake level $${t}: ${got} bets (floor ${MIN_BETS_PER_STAKE_TIER})`);
    }
  }
  if (undeclaredStakeBets > 0) {
    failures.push(`${undeclaredStakeBets} bets at a stake outside the declared stake levels ${EXPECTED_STAKE_TIERS.map(t => `$${t}`).join(', ')}`);
  }

  // ── Direction-mode coverage (DICE-15) ─────────────────────────────────────────
  // The observed set of bet_type values must equal the declared set EXACTLY: every declared mode
  // exercised, no undeclared mode present.
  const observedModes = [...new Set(bets.map(b => b.request.bet_type))].sort();
  const declaredModes = [...DECLARED_DIRECTION_MODES].sort();
  const missingModes  = declaredModes.filter(m => !observedModes.includes(m));
  const extraModes    = observedModes.filter(m => !declaredModes.includes(m));
  if (missingModes.length > 0) {
    failures.push(`declared direction mode(s) never exercised: ${missingModes.join(', ')}`);
  }
  if (extraModes.length > 0) {
    failures.push(`undeclared direction mode(s) present in the capture: ${extraModes.join(', ')} (the verifier is written only for ${declaredModes.join(', ')})`);
  }

  const ok = failures.length === 0;
  const s18 = step(18, 'Configuration Coverage (target space, stake levels, direction mode)',
    ok ? 'PASS' : 'FAIL',
    ok
      ? `All ${TARGET_BANDS} target bands of width ${bandWidth} carry at least the ${MIN_BETS_PER_TARGET_BAND}-bet floor `
        + `declared in src/loader.ts (${distinctTargets.size} of ${totalTargets} valid targets exercised); both declared `
        + `stake levels exercised above the ${MIN_BETS_PER_STAKE_TIER}-bet floor `
        + `(${EXPECTED_STAKE_TIERS.map(t => `$${t}: ${stakeCounts[String(t)]}`).join(', ')}); the declared direction mode set `
        + `{${declaredModes.join(', ')}} is exactly the set observed in the capture; roll-under is offered by Duel, was not `
        + `captured and is not covered by this audit (DL-14). `
        + `In Duel's 0.1% edge tier, which holds every captured bet, the remaining targets carry no unverified return: `
        + `the RTP identity is flat at 0.999 across the full target range and is proven analytically for every target `
        + `in Step 13. Duel's scaled edge tiers are not covered (DL-15).`
      : `${failures.length} coverage failures: ${failures.slice(0, 5).join('; ')}`,
    {
      bandWidth,
      minBetsPerBand: MIN_BETS_PER_TARGET_BAND,
      betsPerBand: bandDetail,
      distinctTargetsExercised: distinctTargets.size,
      totalValidTargets: totalTargets,
      coverageShare,
      neverExercisedTargets: totalTargets - distinctTargets.size,
      maxRtpSpreadAcrossRange: maxRtpSpread,
      rtpFlatnessBound: RTP_FLATNESS_BOUND,
      unverifiedRTPShare: 0,
      stakeTierCounts: stakeCounts,
      minBetsPerStakeTier: MIN_BETS_PER_STAKE_TIER,
      undeclaredStakeBets,
      declaredDirectionModes: declaredModes,
      observedDirectionModes: observedModes,
      note: 'Theoretical RTP is 0.999 at every target, so an unexercised target carries no unverified '
          + 'RTP mass — only no live observation of its multiplier.',
      failures,
    },
  );

  return [s18];
}
