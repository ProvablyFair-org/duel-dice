/**
 * Live-bet statistical context (informational, not scored).
 * At n<1000/config these tests lack power — authoritative results come from simulation.
 */

import type { InfoItem } from './context';
import { VerifyContext } from './context';
import { theoreticalWinChance } from '../../src/rng';
import { chiSquaredTest, lagOneAutocorrelation, waldsWolfowitzRunsTest } from '../../src/stats';

export function run(ctx: VerifyContext): InfoItem[] {
  const { bets, phaseB, phaseC, phaseD, chiResultsLog } = ctx;

  // ── RTP analysis ──────────────────────────────────────────────────────────
  const totalBet = bets.reduce((a, b) => a + parseFloat(b.request.amount), 0);
  const totalWon = bets.reduce((a, b) => a + parseFloat(b.response.amount_won), 0);
  const empiricalRTP = totalWon / totalBet;

  const rtpInfo: InfoItem = {
    label: 'RTP Analysis',
    detail: `Empirical RTP: ${(empiricalRTP * 100).toFixed(4)}% — Dice is high-variance; theoretical RTP 99.9000% proven analytically in simulation step.`,
  };

  // ── Win rate — Phase A (random targets) — chi-squared ─────────────────────
  const targetGroups = new Map<number, { wins: number; total: number }>();
  for (const b of bets) {
    const t   = b.request.target;
    const cur = targetGroups.get(t) ?? { wins: 0, total: 0 };
    cur.total++;
    if (b.response.is_win) cur.wins++;
    targetGroups.set(t, cur);
  }

  let fails  = 0;
  let minP   = 1;
  let tested = 0;
  for (const [target, { wins, total }] of targetGroups) {
    if (total < 10) continue;
    tested++;
    const theor             = theoreticalWinChance(target);
    const { pValue }        = chiSquaredTest([wins, total - wins], [theor * total, (1 - theor) * total]);
    if (pValue < 0.01) fails++;
    if (pValue < minP) minP = pValue;
    chiResultsLog.push({ target, wins, total, theor, pValue });
  }
  const bonferroni = 0.01 / tested;

  const chi2Info: InfoItem = {
    label: 'Win Rate Chi-Squared (per-target groups)',
    detail: `${tested} target groups (≥10 bets) tested; fails at α=0.01: ${fails}/${tested}; min p=${minP.toFixed(4)}; Bonferroni α/${tested}=${bonferroni.toFixed(6)}`,
  };

  // ── Fixed-target phases (B, C, D) ────────────────────────────────────────
  const fixedPhases = [
    { name: 'B', bets: phaseB, target: 9800 },
    { name: 'C', bets: phaseC, target: 9700 },
    { name: 'D', bets: phaseD, target: 9700 },
  ];
  const fixedDetails: string[] = [];
  for (const { name, bets: pb, target } of fixedPhases) {
    const wins  = pb.filter(b => b.response.is_win).length;
    const theor = theoreticalWinChance(target);
    const { pValue } = chiSquaredTest([wins, pb.length - wins], [theor * pb.length, (1 - theor) * pb.length]);
    fixedDetails.push(`Phase ${name}(t=${target}): ${wins}/${pb.length} wins, theor=${(theor * 100).toFixed(4)}%, p=${pValue.toFixed(4)}`);
  }

  const fixedInfo: InfoItem = {
    label: 'Win Rate — Fixed-Target Phases (B/C/D)',
    detail: fixedDetails.join(' | '),
  };

  // ── Serial independence — lag-1 autocorrelation ───────────────────────────
  const resultSeries = bets.map(b => b.response.result);
  const r1           = lagOneAutocorrelation(resultSeries);
  const n            = resultSeries.length;
  const zScore14     = r1 / (1 / Math.sqrt(n));

  const lag1Info: InfoItem = {
    label: 'Serial Independence (lag-1 autocorrelation)',
    detail: `r₁=${r1.toFixed(6)}, z=${zScore14.toFixed(3)} (|z|<3 → no serial correlation). Underpowered at live sample size — see simulation for definitive test.`,
  };

  // ── Wald-Wolfowitz runs test ──────────────────────────────────────────────
  const { runs, expectedRuns, zScore: zScore15, pValue: pValue15 } = waldsWolfowitzRunsTest(resultSeries);

  const runsInfo: InfoItem = {
    label: 'Serial Independence (Wald-Wolfowitz runs test)',
    detail: `runs=${runs}, expected=${expectedRuns.toFixed(1)}, z=${zScore15.toFixed(3)}, p=${pValue15.toFixed(4)}. Underpowered at live sample size — see simulation for definitive test.`,
  };

  return [rtpInfo, chi2Info, fixedInfo, lag1Info, runsInfo];
}
