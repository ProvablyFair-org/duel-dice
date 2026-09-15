/**
 * Steps 7–10: Payout Verification
 */

import type { StepResult } from './context';
import { step, VerifyContext } from './context';
import { theoreticalWinChance, theoreticalMultiplier } from '../../src/rng';

export function run(ctx: VerifyContext): StepResult[] {
  const { bets } = ctx;

  // ── Step 7: Payout math ───────────────────────────────────────────────────────
  // TOLERANCE SIZED TO THE ARITHMETIC. Credited money here is a full-precision product, not a
  // lattice value, so there is no grid to snap it to and the bound is the only thing between a
  // served figure and its recomputation. `> 1e-8` was five orders looser than double arithmetic
  // needs, and the off-grid forgery nudges a served payout by 1e-9 — it passed, measured across
  // this fleet on 2026-09-15. MONEY_REL_TOL is relative so it scales with the figure, and is
  // still orders of magnitude above the worst real deviation in every capture it guards.
  const MONEY_REL_TOL = 1e-12;
  const moneyTol = (x: number): number => MONEY_REL_TOL * Math.max(Math.abs(x), 1);

  let payoutErrors = 0;
  for (const b of bets) {
    const mult = parseFloat(b.response.multiplier);
    const amt  = parseFloat(b.request.amount);
    const won  = parseFloat(b.response.amount_won);
    if (b.response.is_win) {
      if (!Number.isFinite(won) || Math.abs(amt * mult - won) > moneyTol(amt * mult)) payoutErrors++;
    } else {
      if (Math.abs(won) > 1e-12) payoutErrors++;
    }
  }
  const s7 = step(7, 'Payout Math',
    payoutErrors === 0 ? 'PASS' : 'FAIL',
    `${bets.length} bets checked, ${payoutErrors} errors (relative tolerance ${MONEY_REL_TOL})`,
  );

  // ── Step 8: Win condition ─────────────────────────────────────────────────────
  let condErrors = 0;
  for (const b of bets) {
    const expected = b.response.result > b.request.target;
    if (expected !== b.response.is_win) condErrors++;
  }
  const s8 = step(8, 'Win Condition (result > target)',
    condErrors === 0 ? 'PASS' : 'FAIL',
    `${bets.length} bets verified: is_win = (result > target) for all bets; ${condErrors} errors`,
  );

  // ── Step 9: Multiplier formula ────────────────────────────────────────────────
  let multErrors = 0;
  for (const b of bets) {
    const target       = b.request.target;
    const expected     = theoreticalMultiplier(target);
    const actual       = parseFloat(b.response.multiplier);
    if (Math.abs(expected - actual) > 1e-6) multErrors++;
  }
  const s9 = step(9, 'Multiplier Formula (0.999 / win_chance)',
    multErrors === 0 ? 'PASS' : 'FAIL',
    `${bets.length} bets checked; formula: multiplier = 0.999 / ((10000 − target) / 10001); ${multErrors} mismatches`,
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
