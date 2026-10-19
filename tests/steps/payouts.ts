/**
 * Steps 7–10: Payout Verification
 */

import * as fs   from 'fs';
import * as path from 'path';
import type { StepResult } from './context';
import { step, VerifyContext } from './context';
import {
  theoreticalWinChance, computeResult, computeResultFromBuffer, RANGE,
  GRID, parseGridUnits, exactMultiplierUnits, exactPayoutUnits,
} from '../../src/rng';
import { DECLARED_DIRECTION_MODES } from '../../src/loader';

export function run(ctx: VerifyContext): StepResult[] {
  const { bets, phaseC, seedMap } = ctx;

  // ── Step 7: Payout math + bet-size invariance (isolated Phase C assertion) ────
  // 0.1 % EDGE TIER. Duel scales the dice edge with stake (E14, the duel.com dice config as fetched
  // 2026-10-05 in a logged-in session, read-only GET: each range's 0.1 % tier runs to the stake whose
  // potential profit at the range's longest odds is about $25,000, then the edge rises to 1.0 %, or
  // less where the $3m max bet ends the ladder). Every captured bet is in the 0.1 % tier, so the rule
  // below is that tier's rule; scaled tiers are not verified (DL-15).
  // EXACT ON THE SERVED 1e-18 GRID — NO TOLERANCE. Every served money figure is a decimal string
  // with at most 18 fractional digits, i.e. an integer count of 1e-18 units, so the comparison is
  // integer equality in BigInt (src/rng.ts), never a parseFloat at a tolerance. This replaced a
  // relative 1e-12 tolerance on parsed doubles (itself the replacement of an absolute 1e-8): its
  // floor max(|x|, 1) made it an absolute 1e-12 on every credit below 1, which forgave a credit up
  // to 10^6 grid units off its rule.
  // Two conjuncts per WIN, both exact:
  //   (a) DECLARED SETTLEMENT RULE — amount_won == nearest 1e-18 unit of stake × the exact formula
  //       multiplier 0.999·10001/(10000 − target) (src/rng.ts exactPayoutUnits);
  //   (b) PAYOUT = AMOUNT × SERVED MULTIPLIER on the grid — amount_won is the grid point nearest
  //       the exact product stake × served multiplier: |amount_won·1e18 − stake·multiplier| ≤ ½ unit.
  // Every LOSS must credit exactly 0 units. A served string that is not a plain ≤18-dp decimal
  // (NaN, exponent, sign, 19+ digits) cannot be on the grid and is an error, not a pass.
  let payoutErrors = 0, lossErrors = 0, unparseable = 0, winsChecked = 0, lossesChecked = 0;
  let settlementTies = 0, productHalfUnits = 0;
  for (const b of bets) {
    const amt  = parseGridUnits(b.request.amount);
    const mult = parseGridUnits(b.response.multiplier);
    const won  = parseGridUnits(b.response.amount_won);
    if (amt === null || mult === null || won === null) { unparseable++; continue; }
    if (b.response.is_win) {
      winsChecked++;
      const rule = exactPayoutUnits(amt, b.request.target);
      if (rule.tie) settlementTies++;
      const dev = won * GRID - amt * mult;                 // in units of 1e-36
      const absDev = dev < 0n ? -dev : dev;
      if (2n * absDev === GRID) productHalfUnits++;
      if (won !== rule.units || 2n * absDev > GRID) payoutErrors++;
    } else {
      lossesChecked++;
      if (won !== 0n) lossErrors++;
    }
  }
  const moneyOk = payoutErrors === 0 && lossErrors === 0 && unparseable === 0
    && winsChecked + lossesChecked === bets.length;

  // SAME RULE AS THE BASE-STAKE CONFIG (DICE-12). Phase C ($10) and Phase D ($0.01) were both played
  // at target 9,700, so the two phases are the same configuration at two stakes. The served
  // multiplier must be one and the same 1e-18-grid value across every bet of both phases at that
  // target (within the 0.1 % edge tier the price does not move with the stake; both captured
  // stakes are in that tier), and every Phase C win must settle by conjunct (a) above — the same
  // exact rule every base-stake win settles by.
  const cTargets = [...new Set(phaseC.map(b => b.request.target))];
  const baseSameTarget = bets.filter(b => b.phase !== 'C' && cTargets.includes(b.request.target)
    && parseGridUnits(b.request.amount) !== parseGridUnits(phaseC[0]?.request.amount ?? ''));
  const multByTarget = new Map<number, Set<string>>();
  for (const b of [...phaseC, ...baseSameTarget]) {
    const s = multByTarget.get(b.request.target) ?? new Set<string>();
    s.add(String(parseGridUnits(b.response.multiplier)));
    multByTarget.set(b.request.target, s);
  }
  const priceStakeInvariant = baseSameTarget.length > 0
    && [...multByTarget.values()].every(s => s.size === 1);

  // BET-SIZE INVARIANCE (DICE-12), asserted here in isolation rather than only folded into the
  // whole-dataset recomputation of Step 5. The claim is that the roll is a function of
  // (serverSeed, clientSeed, nonce) ALONE — the wager is not an input — so an elevated-stake bet
  // must recompute to exactly the same lattice value it would at the base stake, and must settle
  // by the same `payout = amount × multiplier` rule. Two things are checked:
  //   • every Phase C bet ($10, 1,000× the 0.01 used elsewhere) recomputes to its recorded roll by
  //     exact integer equality — the same predicate Step 5 applies to the base-stake phases;
  //   • the engine's SIGNATURE takes no wager/amount argument (arity 3: serverSeed, clientSeed,
  //     nonce), so a stake-dependent roll is impossible by construction, not merely unobserved.
  // This is about the ROLL. In Duel's dice config (E14) stake selects the edge tier, and so the
  // multiplier above the 0.1 % tier; which tier Duel's server applies there is not verified (DL-15).
  // All captured stakes are in the 0.1 % tier (Phase C, $10 at target 9,700, is 1.55 % of that
  // range's $644.25 0.1 % ceiling in E14), so the price comparison holds within that tier only.
  // A coverage guard (chk === phaseC.length, chk > 0) means a pass over an empty Phase C cannot
  // occur. NOTE — the ELEVATED-STAKE WIN payout path is exercised only 5 times: Phase C is at
  // target 9,700 (~3 % win chance), below the profile's "≥ 100 wins at ~50 % win chance" floor for
  // a full bet-size step. The floor is ASSUMED, not met: the witness count is printed below and
  // disclosed as DL-6. The capture (2026-04-11) predates the profile standard that set the floor;
  // it is a capture-design gap, not something this recomputation can close.
  const noWagerArg = computeResult.length === 3 && computeResultFromBuffer.length === 3;
  let cChk = 0, cBad = 0;
  for (const b of phaseC) {
    const ss = seedMap.get(b.response.server_seed_hashed);
    if (!ss) continue;
    cChk++;
    const computed = computeResult(ss, b.response.client_seed, b.response.nonce);
    if (computed !== b.response.result) cBad++;
  }
  const cWins   = phaseC.filter(b => b.response.is_win).length;
  const cStakes = [...new Set(phaseC.map(b => parseFloat(b.request.amount)))].sort((a, z) => a - z);
  const betSizeInvariant = noWagerArg && cChk === phaseC.length && cChk > 0 && cBad === 0 && priceStakeInvariant;
  const PHASE_C_WIN_FLOOR = 100;   // profile DICE-12 floor — ASSUMED, witness count below

  const s7 = step(7, 'Payout Math',
    moneyOk && betSizeInvariant ? 'PASS' : 'FAIL',
    moneyOk && betSizeInvariant
      ? `${bets.length} bets compared EXACTLY on the served 1e-18 grid (integer units, no tolerance): `
        + `${winsChecked} wins settle to the nearest unit of stake × 0.999·10001/(10000 − target) and lie within ½ unit `
        + `of stake × the served multiplier; ${lossesChecked} losses credit exactly 0; ${payoutErrors + lossErrors} errors, `
        + `${unparseable} unparseable (${settlementTies} exact ties — tie direction unwitnessed). Bet-size invariance: `
        + `${cChk}/${phaseC.length} Phase C bets at stake ${cStakes.map(s => `$${s}`).join(', ')} recompute their roll `
        + `identically to the base-stake phases (${cBad} mismatch); the engine takes no wager argument (computeResult `
        + `arity ${computeResult.length}), so the roll does not depend on stake; in Duel's dice config (E14) stake selects the edge tier, which is not verified above the 0.1% tier (DL-15), and `
        + `Step 9 checks every captured multiplier at the 0.1% tier's price; the served multiplier at target ${cTargets.join(', ')} is one grid value across the `
        + `${phaseC.length} Phase C and ${baseSameTarget.length} base-stake bets at that target, and the ${cWins} Phase C wins `
        + `settle by the same exact rule. ASSUMED: ${cWins} elevated-stake wins against the profile's ${PHASE_C_WIN_FLOOR}-win `
        + `floor (DL-6, captured before the standard)`
      : !moneyOk
        ? `${bets.length} bets on the 1e-18 grid: ${payoutErrors} win(s) off the settlement rule, ${lossErrors} loss(es) `
          + `crediting non-zero, ${unparseable} served string(s) not on the grid`
        : cChk === 0
          ? `BET-SIZE INVARIANCE COVERAGE FAIL: 0 Phase C bets recomputed`
          : !noWagerArg
            ? `BET-SIZE INVARIANCE FAIL: the roll engine's signature accepts a wager argument (computeResult arity ${computeResult.length}, expected 3)`
            : !priceStakeInvariant
              ? `BET-SIZE INVARIANCE FAIL: the served multiplier at target ${cTargets.join(', ')} differs between the elevated `
                + `and base stakes (${[...multByTarget.values()].map(s => s.size).join(', ')} distinct value(s); `
                + `${baseSameTarget.length} base-stake bets at that target)`
              : `BET-SIZE INVARIANCE FAIL: ${cBad} of ${cChk} Phase C bets do not recompute to their recorded roll`,
    { payoutErrors, lossErrors, unparseable, winsChecked, lossesChecked, comparison: 'on-grid-exact (1e-18 units)',
      settlementTies, productHalfUnits,
      phaseCChecked: cChk, phaseCBets: phaseC.length, phaseCMismatches: cBad,
      phaseCWins: cWins, phaseCWinFloor: PHASE_C_WIN_FLOOR, phaseCWinFloorMet: cWins >= PHASE_C_WIN_FLOOR,
      noWagerArg, stakes: cStakes, priceStakeInvariant, baseStakeBetsSameTarget: baseSameTarget.length },
  );

  // ── Step 8: Win condition + outcome range + declared modes & boundary (DICE-10, DICE-17) ──────
  // DICE-10 has two conjuncts. (1) The recorded win flag equals the declared win rule
  // (is_win = result > target) for every bet. (2) Every recorded roll lies inside the DECLARED
  // OUTCOME RANGE [0, RANGE-1] = [0, 10000]. The declared range is the lattice the draw maps onto
  // (src/rng.ts: result = chunk % RANGE ∈ 0..RANGE-1), not a bound read from the data.
  //
  // DICE-17 rides on the same win-rule scan and adds the DECLARED-MODE and BOUNDARY conjuncts:
  //   • DECLARED MODES. The audited mode set is {over} (win iff result > target); Duel also offers
  //     roll-under, which this capture does not hold and this audit does not cover (DL-14). Every
  //     audited mode is recomputed at full coverage — the single over rule is the
  //     win-flag check above on all 6,700 bets — and the observed bet_type set is asserted to be
  //     exactly {over}, so an undeclared mode the verifier is not written for cannot pass unseen.
  //   • BOUNDARY, WITNESSED BY DATA (not from source alone). The win rule is STRICT: a tie
  //     (result == target) LOSES. This is discriminated from the inclusive rule `result >= target`
  //     by two live observations straddling the boundary — a bet with result == target that settled
  //     as a LOSS, and a bet with result == target+1 that settled as a WIN. Both are required to be
  //     present in the capture; a boundary asserted from the source alone would be declared
  //     unwitnessed, and this capture does not have to.
  //   • ROLL CEILING, WITNESSED EMPIRICALLY. The lattice ceiling is RANGE-1 = 10,000 (the top
  //     residue of chunk % RANGE). No live bet reached it (max observed roll 9,998), so the ceiling
  //     is witnessed by the auditor's own pinned uniformity census (2,000,000 draws), whose observed
  //     roll span must be exactly [0, 10000] — the full lattice including the ceiling and floor.
  const ROLL_MIN = 0;
  const ROLL_MAX = RANGE - 1;   // 10000
  let condErrors  = 0;
  let rangeErrors = 0;
  let tieCount = 0, tieAllLose = true, straddleWinCount = 0;
  for (const b of bets) {
    const expected = b.response.result > b.request.target;
    if (expected !== b.response.is_win) condErrors++;
    const r = b.response.result;
    if (!Number.isInteger(r) || r < ROLL_MIN || r > ROLL_MAX) rangeErrors++;
    if (r === b.request.target) { tieCount++; if (b.response.is_win) tieAllLose = false; }
    if (r === b.request.target + 1 && b.response.is_win) straddleWinCount++;
  }
  // Declared modes: the observed bet_type set must equal DECLARED_DIRECTION_MODES exactly.
  const observedModes = [...new Set(bets.map(b => b.request.bet_type))].sort();
  const declaredModes = [...DECLARED_DIRECTION_MODES].sort();
  const modesMatch = observedModes.length === declaredModes.length
    && observedModes.every((m, i) => m === declaredModes[i]);
  // Boundary witnessed by data: a tie that loses AND a just-above-tie that wins.
  const boundaryWitnessed = tieCount >= 1 && tieAllLose && straddleWinCount >= 1;
  // Roll ceiling witnessed empirically by the pinned uniformity census.
  let censusRollMin = -1, censusRollMax = -1, censusPresent = false;
  try {
    const sim = JSON.parse(fs.readFileSync(path.join(ctx.outputsDir, 'simulation-results.json'), 'utf8'));
    censusRollMin = Number(sim?.pass1?.uniformity?.rollMin);
    censusRollMax = Number(sim?.pass1?.uniformity?.rollMax);
    censusPresent = Number.isInteger(censusRollMin) && Number.isInteger(censusRollMax);
  } catch { censusPresent = false; }
  const ceilingWitnessed = censusPresent && censusRollMin === ROLL_MIN && censusRollMax === ROLL_MAX;

  const s8Ok = condErrors === 0 && rangeErrors === 0 && modesMatch && boundaryWitnessed && ceilingWitnessed;
  const s8 = step(8, 'Win Condition (result > target) & Outcome Range',
    s8Ok ? 'PASS' : 'FAIL',
    s8Ok
      ? `${bets.length} bets: is_win = (result > target) for every bet (${condErrors} errors), every recorded roll `
        + `an integer inside [${ROLL_MIN}, ${ROLL_MAX}] (${rangeErrors} out of range); declared modes {${declaredModes.join(', ')}} `
        + `recomputed at full coverage and the observed bet_type set equals them; boundary WITNESSED BY DATA — `
        + `${tieCount} tie (result == target) settled as a loss and ${straddleWinCount} just-above-tie (result == target+1) `
        + `settled as a win, discriminating the strict > rule from result >= target; roll ceiling ${ROLL_MAX} and floor ${ROLL_MIN} `
        + `witnessed empirically by the 2,000,000-draw uniformity census (observed span [${censusRollMin}, ${censusRollMax}])`
      : condErrors > 0
        ? `${bets.length} bets: ${condErrors} win-flag errors (is_win != result > target)`
        : rangeErrors > 0
          ? `${bets.length} bets: ${rangeErrors} rolls outside the declared outcome range [${ROLL_MIN}, ${ROLL_MAX}]`
          : !modesMatch
            ? `DECLARED-MODE MISMATCH: observed bet_type set {${observedModes.join(', ')}} != declared {${declaredModes.join(', ')}}`
            : !boundaryWitnessed
              ? `BOUNDARY UNWITNESSED: ${tieCount} ties (all lose: ${tieAllLose}), ${straddleWinCount} straddle wins — the strict > rule is not discriminated from >= by the data`
              : `ROLL CEILING UNWITNESSED: uniformity census ${censusPresent ? `span [${censusRollMin}, ${censusRollMax}] != [${ROLL_MIN}, ${ROLL_MAX}]` : 'absent'}`,
    { condErrors, rangeErrors, rollMin: ROLL_MIN, rollMax: ROLL_MAX,
      tieCount, straddleWinCount, boundaryWitnessed, ceilingWitnessed,
      censusRollMin, censusRollMax, observedModes },
  );

  // ── Step 9: Multiplier formula ────────────────────────────────────────────────
  // EXACT ON THE SERVED 1e-18 GRID. The served multiplier is an 18-dp string; the declared formula
  // 0.999 / ((10000 − target) / 10001) is the exact rational 999·10001 / (1000·(10000 − target)),
  // rounded to the nearest 1e-18 unit (src/rng.ts exactMultiplierUnits — BigInt, no float). The two
  // must be the SAME INTEGER. The former check parsed the string to a double and allowed 1e-6, i.e.
  // 10^12 grid units: a multiplier shaved in its 7th decimal passed. Only request.target feeds the
  // derivation; no operator odds field is read.
  let multErrors = 0, multUnparseable = 0, multTies = 0;
  for (const b of bets) {
    const served = parseGridUnits(b.response.multiplier);
    if (served === null) { multUnparseable++; multErrors++; continue; }
    const exp = exactMultiplierUnits(b.request.target);
    if (exp.tie) multTies++;
    if (served !== exp.units) multErrors++;
  }
  const s9 = step(9, 'Multiplier Formula (0.999 / win_chance)',
    multErrors === 0 ? 'PASS' : 'FAIL',
    `${bets.length} bets checked EXACTLY on the served 1e-18 grid: multiplier == nearest 1e-18 unit of `
      + `999·10001 / (1000·(10000 − target)) = 0.999 / ((10000 − target) / 10001), integer equality, no tolerance; `
      + `${multErrors} mismatches (${multUnparseable} not on the grid; ${multTies} exact ties — tie direction unwitnessed)`,
    { multErrors, multUnparseable, multTies, comparison: 'on-grid-exact (1e-18 units)' },
  );

  // ── Step 10: Win chance formula ───────────────────────────────────────────────
  let wcErrors = 0;
  for (const b of bets) {
    const target   = b.request.target;
    const expected = theoreticalWinChance(target);
    const actual   = parseFloat(b.response.win_chance);
    if (Math.abs(expected - actual) > 1e-14) wcErrors++;
  }
  const s10 = step(10, 'Win Chance Formula ((10000 − target) / 10001)',
    wcErrors === 0 ? 'PASS' : 'FAIL',
    `${bets.length} bets checked; formula confirmed exact to 14 decimal places; ${wcErrors} mismatches`,
  );

  return [s7, s8, s9, s10];
}
