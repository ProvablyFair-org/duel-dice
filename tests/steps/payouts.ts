/**
 * Steps 7–10: Payout Verification
 */

import type { StepResult } from './context';
import { step, VerifyContext } from './context';
import { theoreticalWinChance, theoreticalMultiplier } from '../../src/rng';

export function run(ctx: VerifyContext): StepResult[] {
  const { bets } = ctx;

  // ── Step 7: Payout math ───────────────────────────────────────────────────────
  let payoutErrors = 0;
  for (const b of bets) {
    const mult = parseFloat(b.response.multiplier);
    const amt  = parseFloat(b.request.amount);
    const won  = parseFloat(b.response.amount_won);
    if (b.response.is_win) {
      if (Math.abs(amt * mult - won) > 1e-8) payoutErrors++;
    } else {
      if (Math.abs(won) > 1e-12) payoutErrors++;
    }
  }
  const s7 = step(7, 'Payout Math',
    payoutErrors === 0 ? 'PASS' : 'FAIL',
    `${bets.length} bets checked, ${payoutErrors} errors (tolerance 1e-8)`,
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
