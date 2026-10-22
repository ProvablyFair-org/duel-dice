/**
 * Steps 16–17: Simulation Cross-Check — scored against the PINNED census.
 *
 * Both steps score the COMMITTED outputs/simulation-results.json (produced by `npm run simulate`),
 * which `npm test` does NOT regenerate. NOTHING here trusts a scalar the artifact reports about
 * itself: every sample DEPTH is required to equal its src/sim-config.ts constant, and every scored
 * STATISTIC is RE-DERIVED — the uniformity chi-squared and per-band RTP from the stored counts, the
 * runs z from the stored cell counts, and all 134 × 10,000 Pass-2 draws from the dataset's own
 * revealed seeds — then compared with EXACT equality. A cheap run cannot pose as the deep one, and a
 * forged-and-re-pinned artifact is rejected by re-derivation rather than by the hash.
 *
 *   Step 16 (DICE-20) — Pass 1: draw uniformity on ≥2,000,000 draws (chi-squared re-derived from the
 *   100-bin histogram) plus lag-1 and Wald–Wolfowitz runs, the three screens Bonferroni-corrected to
 *   α/3 so the step's family-wise level is α; and edge convergence on 98 target bands spanning both
 *   ends at 1,000,000 bets each, every band's RTP re-derived from its stored win count.
 *
 *   Step 17 (DICE-21) — Pass 2: every revealed seed × 10,000 nonces, early window = nonces 0–49
 *   (SIM_PASS2_EARLY_WINDOW, the 50-bet captured depth per epoch; the captured nonce range is 0–50,
 *   nonce 50 occurring only in the 4 capture-retry epochs, DL-1), reference window = the remainder
 *   (50–9999); the statistic is the payout-weighted return of the bands the casino actually served
 *   in that epoch, standardized by the exact per-bet mean and variance of that return (a sum of
 *   independent scaled Bernoullis — a scaled Poisson-binomial null — aggregated across seeds).
 *   Every window is re-derived here from the revealed seeds; the exact moments standardize the
 *   aggregate return, tested with a pre-registered one-sided normal (CLT) lower-tail; direction
 *   split and detection power printed.
 *
 * The one Pass-1 statistic that cannot be re-derived from anything in the repo is `lag1` (the
 * autocorrelation needs the raw 2,000,000-draw sequence, which is not stored); its z is re-derived
 * as lag1·√n and bounded by its screen — declared limitation DL-7.
 */

import * as fs   from 'fs';
import * as path from 'path';

import type { StepResult } from './context';
import { step, VerifyContext } from './context';
import { computeResultFromBuffer, theoreticalWinChance, theoreticalMultiplier, RANGE } from '../../src/rng';
import {
  chiSquaredTest, chiSquaredPValue, runsStatisticFromCounts,
  inverseCriticalZ, normalLowerTailP,
} from '../../src/stats';
import {
  ALPHA, ALPHA_SCREEN, THEORETICAL_RTP,
  SIM_UNIFORMITY_DRAWS, SIM_UNIFORMITY_BINS, SIM_EDGE_BETS, SIM_EDGE_TARGETS,
  SIM_CONVERGENCE_MARKS, SIM_PASS2_NONCES, SIM_PASS2_EARLY_WINDOW, SIM_PASS2_ALPHA,
} from '../../src/sim-config';
import { numbersAgree } from '../../src/diff';
import {
  uniformityScreenFalseAlarm, serialScreensFalseAlarm, edgeBandFalseAlarm, PASS2_FALSE_ALARM,
  FAIL_FALSE_ALARM_CAP, rate4, fmtRate,
} from '../../src/false-alarm';

/**
 * A RECOMPUTED float (chi², runs z, lag-1 z, per-epoch return / expectation / variance sums)
 * against the shipped one: the reproduction rule, 1e-14 absolute + 1e-12 relative (src/diff.ts
 * numbersAgree), not bit equality. The last bits of a derived floating-point statistic are a
 * property of the machine that computed it (keno measured 1-ulp p drift between macOS arm64 and
 * Linux node:22, GitHub Actions run 36466858888). A shipped value that differs by more than the
 * bound still FAILs (mutation M16r); integer pairs (counts, df, N) stay exact.
 */
const agree = (a: unknown, b: unknown): boolean =>
  typeof a === 'number' && typeof b === 'number' && numbersAgree(a, b);

export function run(ctx: VerifyContext): StepResult[] {
  const { outputsDir } = ctx;
  const simPath = path.join(outputsDir, 'simulation-results.json');

  if (!fs.existsSync(simPath)) {
    return [
      step(16, 'Simulation Results — Pass 1 Integrity', 'FLAG',
        'simulation-results.json not found — run npm run simulate first'),
      step(17, 'Simulation Results — Pass 2 Cherry-Pick Test', 'FLAG',
        'simulation-results.json not found'),
    ];
  }

  const sim = JSON.parse(fs.readFileSync(simPath, 'utf-8'));

  // ══ Step 16: Pass 1 — re-derive every scored predicate from the census ══════════
  const p1  = sim.pass1 ?? {};
  const uniA = p1.uniformity ?? {};
  const modelOk = sim.model?.range === RANGE
    && Math.abs((sim.model?.houseEdge ?? -1) - (1 - THEORETICAL_RTP)) < 1e-12;

  // (a) draw uniformity — depth pinned, histogram re-summed, chi² RE-DERIVED from the bin counts,
  // two-sided at ALPHA_SCREEN (upper tail = non-uniform; lower tail = a chi² too small to be a
  // 2,000,000-draw sample, i.e. a written statistic).
  const hist: number[] = Array.isArray(uniA.histogram) ? uniA.histogram : [];
  const histSum = hist.reduce((a, b) => a + b, 0);
  const uniDepthOk = uniA.draws === SIM_UNIFORMITY_DRAWS && Number(uniA.n) === SIM_UNIFORMITY_DRAWS
    && Number(uniA.bins) === SIM_UNIFORMITY_BINS && hist.length === SIM_UNIFORMITY_BINS
    && histSum === SIM_UNIFORMITY_DRAWS && Number(uniA.df) === SIM_UNIFORMITY_BINS - 1;
  const uniRe = uniDepthOk
    ? chiSquaredTest(hist, new Array(SIM_UNIFORMITY_BINS).fill(SIM_UNIFORMITY_DRAWS / SIM_UNIFORMITY_BINS))
    : { chi2: NaN, df: NaN, pValue: NaN };
  const uniChi2Re = uniRe.chi2;
  const uniPRe    = chiSquaredPValue(uniChi2Re, SIM_UNIFORMITY_BINS - 1);
  const uniTooUniform = uniPRe > 1 - ALPHA_SCREEN / 2;
  const uniNonUniform = uniPRe < ALPHA_SCREEN / 2;
  const uniPass = uniDepthOk && Number.isFinite(uniChi2Re)
    && agree(uniA.chi2, uniChi2Re)                   // stored chi² must BE the re-derived chi² (reproduction bound)
    && !uniTooUniform && !uniNonUniform;

  // (b) serial screens — runs z RE-DERIVED from cell counts; lag1Z re-derived as lag1·√n and bounded.
  const ser = uniA.serial ?? {};
  const zCrit = inverseCriticalZ(ALPHA_SCREEN);
  const lag1  = Number(ser.lag1), lag1Z = Number(ser.lag1Z);
  const lag1ZRe = lag1 * Math.sqrt(SIM_UNIFORMITY_DRAWS);
  const runsCount = Number(ser.runs), n1 = Number(ser.n1), serN = Number(ser.n);
  const runsCountsOk = Number.isInteger(runsCount) && Number.isInteger(n1) && Number.isInteger(serN)
    && n1 >= 0 && n1 <= serN && runsCount >= 1 && runsCount <= serN;
  const runsRe = runsCountsOk ? runsStatisticFromCounts(runsCount, n1, serN) : null;
  const runsZOk = !!runsRe && !runsRe.degenerate && agree(runsRe.z, Number(ser.runsZ));
  const serialPass = serN === SIM_UNIFORMITY_DRAWS
    && Number.isFinite(lag1) && Number.isFinite(lag1Z) && agree(lag1Z, lag1ZRe)
    && Math.abs(lag1Z) < zCrit
    && runsZOk && runsRe!.pValue >= ALPHA_SCREEN;

  // (c) edge bands — the 98 rows must BE the 98 canonical targets, distinct; each band's RTP is
  // re-derived from its win count and required within 5·SE of the flat 0.999.
  const edge: Array<{ target: number; n: number; wins: number }> = Array.isArray(p1.edge) ? p1.edge : [];
  const gotTargets = edge.map(r => r.target);
  const bandsIdentical = edge.length === SIM_EDGE_TARGETS.length
    && new Set(gotTargets).size === edge.length
    && SIM_EDGE_TARGETS.every(t => gotTargets.includes(t));
  let edgeWithin = 0, edgeMeanReSum = 0;
  const edgeNotes: string[] = [];
  for (const r of edge) {
    if (Number(r.n) !== SIM_EDGE_BETS || !Number.isInteger(r.wins) || r.wins < 0 || r.wins > r.n) continue;
    const p    = theoreticalWinChance(r.target);
    const mult = theoreticalMultiplier(r.target);
    const winRate = r.wins / r.n;
    const simRtp  = winRate * mult;                 // → 0.999 under the null
    const se      = Math.sqrt(p * (1 - p)) * mult / Math.sqrt(r.n);
    edgeMeanReSum += simRtp * 100;
    if (Math.abs(simRtp - THEORETICAL_RTP) <= 5 * se + 1e-4) edgeWithin++;
    else if (edgeNotes.length < 3) edgeNotes.push(`t=${r.target}: RTP ${(simRtp * 100).toFixed(3)}% off by ${(Math.abs(simRtp - THEORETICAL_RTP) / se).toFixed(2)}·SE`);
  }
  const meanRtpRe = edge.length ? edgeMeanReSum / edge.length : NaN;
  const edgePass = bandsIdentical && edgeWithin === edge.length && edge.length > 0
    && Number.isFinite(Number(p1.meanRtp)) && Math.abs(Number(p1.meanRtp) - meanRtpRe) < 1e-9;

  // (d) convergence — structure only (the cross-band running means are not re-derivable from the
  // stored per-band final counts): the marks must be the pinned marks and every value a legal RTP%.
  const conv: Array<{ roundCount: number; meanRTP: number; stdDev: number }> =
    Array.isArray(p1.convergence) ? p1.convergence : [];
  const convStructOk = conv.length === SIM_CONVERGENCE_MARKS.length
    && SIM_CONVERGENCE_MARKS.every((m, i) => Number(conv[i]?.roundCount) === m)
    && conv.every(c => Number.isFinite(Number(c.meanRTP)) && Number(c.meanRTP) >= 0 && Number.isFinite(Number(c.stdDev)) && Number(c.stdDev) >= 0);

  // FALSE-ALARM RATE ON A FAIR GAME of every rule that can move Step 16 to FAIL (the 2026-10-06
  // standard: written down, at most 1% for a FAIL), computed from the rules as implemented above, not
  // from their nominal levels (src/false-alarm.ts says why the two differ here). The step's rate is
  // at most the sum over its rules.
  const faUni    = uniformityScreenFalseAlarm(RANGE, SIM_UNIFORMITY_BINS, SIM_UNIFORMITY_DRAWS, ALPHA_SCREEN);
  const faSerial = serialScreensFalseAlarm(RANGE, (RANGE - 1) / 2, ALPHA_SCREEN);
  let faEdgeSurvive = 1;
  for (const t of SIM_EDGE_TARGETS) {
    faEdgeSurvive *= 1 - edgeBandFalseAlarm(SIM_EDGE_BETS, theoreticalWinChance(t), theoreticalMultiplier(t), THEORETICAL_RTP).rate;
  }
  const faEdge = 1 - faEdgeSurvive;
  const faStep16 = faUni.rate + faSerial.either + faEdge;
  const evenBin = Math.round(RANGE / SIM_UNIFORMITY_BINS);
  const unevenBins = faUni.binSizes.map((n, i) => ({ i, n })).filter(b => b.n !== evenBin);
  const faNote16 = `false-alarm rate on a fair game (FAIL cap ${FAIL_FALSE_ALARM_CAP}): uniformity screen ${fmtRate(faUni.rate)} `
    + `(nominal ${fmtRate(ALPHA_SCREEN)}; ${unevenBins.map(b => `bin ${b.i} holds ${b.n}`).join(', ')} of the ${RANGE.toLocaleString('en-US')} `
    + `lattice values, the others ${evenBin}, and every expected count is taken as equal: non-central chi-squared, `
    + `λ=${faUni.noncentrality.toFixed(2)}), lag-1 ${fmtRate(faSerial.lag1)}, runs ${fmtRate(faSerial.runs)}, lag-1 or runs `
    + `${fmtRate(faSerial.either)} (the two statistics correlate at ${faSerial.correlation.toFixed(2)} on the same draws; bivariate normal), `
    + `any of the ${SIM_EDGE_TARGETS.length} edge bands beyond 5·SE ${fmtRate(faEdge)} (exact binomial); step ≤ ${fmtRate(faStep16)}`
    + `${faStep16 <= FAIL_FALSE_ALARM_CAP ? '' : ' — OVER THE CAP'}`;

  const s16Ok = modelOk && uniPass && serialPass && edgePass && convStructOk;
  const s16 = step(16, 'Simulation Results — Pass 1 Integrity',
    s16Ok ? 'PASS' : 'FAIL',
    (s16Ok
      ? `scored against the COMMITTED census, not a fresh run; three screens Bonferroni-corrected to `
        + `α_screen=${ALPHA_SCREEN.toExponential(3)} (family-wise α=${ALPHA}). `
        + `draw uniformity chi²=${uniChi2Re.toFixed(3)} df=${SIM_UNIFORMITY_BINS - 1} RE-DERIVED from the `
        + `${SIM_UNIFORMITY_BINS}-bin histogram over ${SIM_UNIFORMITY_DRAWS.toLocaleString()} draws → p reported in data (two-sided, in band); `
        + `serial: runsZ RE-DERIVED from cell counts (runs=${runsCount}, n1=${n1}) within screen, lag1Z=lag1·√n within zCrit ${zCrit.toFixed(3)}; `
        + `edge ${edgeWithin}/${edge.length} bands within 5·SE of ${THEORETICAL_RTP} at ${SIM_EDGE_BETS.toLocaleString()} bets (RTP re-derived from each stored win count), band set identical to the ${SIM_EDGE_TARGETS.length} canonical targets; `
        + `convergence ${conv.length} marks structurally intact; mean simulated RTP in this step's data block`
      : !uniPass ? `PASS-1 UNIFORMITY FAIL: depth/histogram/chi² re-derivation or the two-sided screen rejected (uniDepthOk=${uniDepthOk}, storedChi2=${uniA.chi2}, reDerived=${uniChi2Re})`
      : !serialPass ? `PASS-1 SERIAL FAIL: lag1Z=${lag1Z} vs re-derived ${lag1ZRe} (zCrit ${zCrit.toFixed(3)}), runsZ re-derivation ${runsZOk ? 'ok' : 'MISMATCH'}`
      : !edgePass ? `PASS-1 EDGE FAIL: ${edgeWithin}/${edge.length} bands within 5·SE, band set ${bandsIdentical ? 'ok' : 'NOT canonical'}, meanRtp re-derivation ${Math.abs(Number(p1.meanRtp) - meanRtpRe) < 1e-9 ? 'ok' : 'MISMATCH'}${edgeNotes.length ? ` (${edgeNotes.join('; ')})` : ''}`
      : !convStructOk ? `PASS-1 CONVERGENCE FAIL: marks or values malformed`
      : `PASS-1 MODEL FAIL: range/houseEdge mismatch`) + `; ${faNote16}`,
    {
      uniformityDraws: SIM_UNIFORMITY_DRAWS, uniformityChi2: uniChi2Re, uniformityP: uniPRe,
      lag1Z, runsZ: Number(ser.runsZ), zCrit,
      edgeBands: edge.length, edgeWithin, meanRtp: Number(p1.meanRtp),
      rollMin: Number(uniA.rollMin), rollMax: Number(uniA.rollMax),
      falseAlarm: {
        failCap: FAIL_FALSE_ALARM_CAP,
        uniformityScreen: {
          rate: rate4(faUni.rate), nominal: rate4(ALPHA_SCREEN), upperTail: rate4(faUni.upperTail), lowerTail: rate4(faUni.lowerTail),
          noncentrality: rate4(faUni.noncentrality), unevenBins,
          method: 'non-central chi-squared: the equal-count Pearson statistic against the true lattice bin probabilities',
        },
        serialScreens: {
          lag1: rate4(faSerial.lag1), runs: rate4(faSerial.runs), either: rate4(faSerial.either),
          correlation: rate4(faSerial.correlation),
          method: 'each two-sided normal at α_screen; the union at the lattice correlation of the two statistics, bivariate normal',
        },
        edgeBands: { anyBeyond: rate4(faEdge), method: `exact binomial mass outside each band's passing win counts, ${SIM_EDGE_TARGETS.length} independent bands` },
        stepAtMost: rate4(faStep16),
      },
    },
  );

  // ══ Step 17: Pass 2 — RE-DERIVE every window from the revealed seeds ═════════════
  const p2 = sim.pass2 ?? {};
  const geometryOk = Number(p2.nonces) === SIM_PASS2_NONCES
    && Number(p2.earlyWindow) === SIM_PASS2_EARLY_WINDOW
    && Number(p2.alpha) === SIM_PASS2_ALPHA;

  const perEpoch: Array<Record<string, number | string>> = Array.isArray(p2.perEpoch) ? p2.perEpoch : [];
  // Population identity: one row per REVEALED epoch, keyed by the epoch's own commitment hash.
  const wantHashes = [...ctx.seedMap.keys()].filter(h => (ctx.byHash.get(h) ?? []).length > 0).sort();
  const gotHashes  = perEpoch.map(r => String(r.serverSeedHashed)).sort();
  const epochsOk = perEpoch.length === wantHashes.length
    && new Set(gotHashes).size === perEpoch.length
    && wantHashes.every((h, i) => gotHashes[i] === h);

  // Re-derive each epoch's early + reference return and its exact-null moments from the dataset's
  // own revealed seed. 134 × 10,000 HMACs; compared to the stored census at the reproduction bound (agree()).
  const W = SIM_PASS2_EARLY_WINDOW;
  // The early window is a DEFINITION (nonces 0…W-1, W = the captured depth per epoch); the captured
  // nonce range is a property of the dataset, read here so the detail cannot call one the other. In
  // the capture-retry epochs (DL-1) the capture recorded nonce W and missed one nonce below it; a
  // captured nonce ≥ W lies in the reference window.
  let capturedMinNonce = Infinity, capturedMaxNonce = -Infinity;
  for (const b of ctx.bets) {
    capturedMinNonce = Math.min(capturedMinNonce, b.response.nonce);
    capturedMaxNonce = Math.max(capturedMaxNonce, b.response.nonce);
  }
  const epochsBeyondWindow = [...ctx.byHash.values()].filter(bs => bs.some(b => b.response.nonce >= W)).length;
  const capturedRangeNote = capturedMaxNonce < W
    ? `= the captured range ${capturedMinNonce}–${capturedMaxNonce}`
    : `the captured range is ${capturedMinNonce}–${capturedMaxNonce}: `
      + `${capturedMaxNonce > W ? `nonces ${W}–${capturedMaxNonce} occur` : `nonce ${W} occurs`} `
      + `only in the ${epochsBeyondWindow} capture-retry epochs, DL-1`;
  let rowMismatches = 0, recomputedRows = 0, firstMismatch = '';
  let totalEarlyReturn = 0, totalEarlyExpected = 0, totalEarlyVar = 0, below = 0;
  for (const row of perEpoch) {
    const hash = String(row.serverSeedHashed);
    const serverSeed = ctx.seedMap.get(hash);
    const epochBets = (ctx.byHash.get(hash) ?? []).slice().sort((a, b) => a.response.nonce - b.response.nonce);
    if (!serverSeed || epochBets.length === 0) {
      rowMismatches++;
      if (!firstMismatch) firstMismatch = `epoch ${hash.slice(0, 12)}: no revealed seed`;
      continue;
    }
    const clientSeed = epochBets[0].response.client_seed;
    const key = Buffer.from(serverSeed, 'hex');
    const served: number[] = new Array(W);
    for (const b of epochBets) if (b.response.nonce < W) served[b.response.nonce] = b.request.target;
    let lastSeen = epochBets[0].request.target;
    for (let i = 0; i < W; i++) { if (served[i] === undefined) served[i] = lastSeen; else lastSeen = served[i]; }

    let eR = 0, eE = 0, eV = 0, rR = 0, rE = 0, rV = 0;
    for (let n = 0; n < SIM_PASS2_NONCES; n++) {
      const target = served[n % W];
      const mult = theoreticalMultiplier(target);
      const p = theoreticalWinChance(target);
      const roll = computeResultFromBuffer(key, clientSeed, n);
      const ret = roll > target ? mult : 0;
      const eRet = p * mult, vRet = p * (1 - p) * mult * mult;
      if (n < W) { eR += ret; eE += eRet; eV += vRet; }
      else       { rR += ret; rE += eRet; rV += vRet; }
    }
    recomputedRows++;
    const ok = agree(row.earlyReturn, eR) && agree(row.earlyExpected, eE) && agree(row.earlyVar, eV)
      && agree(row.refReturn, rR) && agree(row.refExpected, rE) && agree(row.refVar, rV)
      && Number(row.earlyN) === W && Number(row.refN) === SIM_PASS2_NONCES - W;
    if (!ok) {
      rowMismatches++;
      if (!firstMismatch) firstMismatch = `epoch ${hash.slice(0, 12)}: stored (early ${row.earlyReturn}) vs recomputed (${eR})`;
    }
    totalEarlyReturn += eR; totalEarlyExpected += eE; totalEarlyVar += eV;
    if (eR < eE) below++;
  }
  const above = recomputedRows - below;

  // Aggregate the early-window return. The true null is Poisson-binomial (a sum of independent
  // scaled Bernoullis), so the aggregate mean/variance are the sums of the per-bet EXACT moments;
  // the exact moments standardize the aggregate return and the tail is a normal (CLT) approximation
  // to that null, not its exact CDF. Pre-registered ONE-SIDED normal (CLT) lower-tail rule:
  // cherry-picking shorts the early window, so reject on p < α.
  const aggZ = totalEarlyVar > 0 ? (totalEarlyReturn - totalEarlyExpected) / Math.sqrt(totalEarlyVar) : 0;
  const aggP = normalLowerTailP(aggZ);
  const zAlpha = inverseCriticalZ(2 * SIM_PASS2_ALPHA), zPower = inverseCriticalZ(2 * 0.20);
  const totalEarlyBets = recomputedRows * W;
  const minDetectablePerBetPct = totalEarlyBets > 0
    ? ((zAlpha + zPower) * Math.sqrt(totalEarlyVar) / totalEarlyBets) * 100 : NaN;

  // The stored aggregates must match the re-derivation exactly.
  const aggMatch = perEpoch.length > 0
    && Math.abs(Number(p2.totalEarlyReturn) - totalEarlyReturn) < 1e-9
    && Math.abs(Number(p2.totalEarlyVar) - totalEarlyVar) < 1e-9
    && Number(p2.directionBelow) === below && Number(p2.directionAbove) === above;

  const rederivedOk = geometryOk && epochsOk && rowMismatches === 0
    && recomputedRows === wantHashes.length && aggMatch;
  // HARD_FAIL policy (DICE-21): a re-derivation mismatch, or an early return anomalously LOW
  // (cherry-pick signal, aggP < α), fails the step. On the honest capture aggP ≫ α → PASS.
  const cherryClean = aggP >= SIM_PASS2_ALPHA;
  const s17Ok = rederivedOk && cherryClean;
  // FALSE-ALARM RATE ON A FAIR GAME of the one rule that moves Step 17 to FAIL (the 2026-10-06
  // standard). The normal tail the rule is tested against is not the null's own tail: the served return
  // is right-skewed, so its lower tail at the normal 1% point is lighter. The rate is declared in
  // src/false-alarm.ts from a calibrated simulation of the served slots (npm run false-alarm:pass2).
  const faNote17 = `false-alarm rate on a fair game (FAIL cap ${FAIL_FALSE_ALARM_CAP}): ${fmtRate(PASS2_FALSE_ALARM.rate)} `
    + `± ${PASS2_FALSE_ALARM.standardError} (the served return's own null, not the normal tail's nominal ${SIM_PASS2_ALPHA}; `
    + `${PASS2_FALSE_ALARM.method}, ${PASS2_FALSE_ALARM.replicates.toLocaleString('en-US')} replicates, npm run false-alarm:pass2)`
    + `${PASS2_FALSE_ALARM.rate <= FAIL_FALSE_ALARM_CAP ? '' : ' — OVER THE CAP'}`;
  const s17 = step(17, 'Simulation Results — Pass 2 Cherry-Pick Test',
    s17Ok ? 'PASS' : 'FAIL',
    (s17Ok
      ? `${recomputedRows} revealed epochs × ${SIM_PASS2_NONCES.toLocaleString()} nonces, ALL windows RE-DERIVED from the revealed seeds `
        + `(early window nonces 0–${W - 1}, reference ${W}–${SIM_PASS2_NONCES - 1}; ${capturedRangeNote}); ${rowMismatches} row mismatches; `
        + `statistic = payout-weighted served-band return standardized by its EXACT per-bet mean and variance (a scaled Poisson-binomial across seeds), tested with a pre-registered one-sided normal (CLT) lower-tail: `
        + `aggregate early z=${aggZ.toFixed(3)}, one-sided normal (CLT) lower-tail p=${aggP.toFixed(4)} ≥ α=${SIM_PASS2_ALPHA} → no cherry-pick; `
        + `direction split ${below} below / ${above} above expectation; detection power ${minDetectablePerBetPct.toFixed(3)} pp per-bet return deficit at 80% power`
      : !rederivedOk
        ? `PASS-2 RE-DERIVATION FAIL: geometry=${geometryOk}, epoch identity=${epochsOk}, ${rowMismatches} row mismatches${firstMismatch ? ` (first: ${firstMismatch})` : ''}, aggregate reconciliation=${aggMatch}`
        : `PASS-2 CHERRY-PICK DETECTED: aggregate early return z=${aggZ.toFixed(3)}, one-sided p=${aggP.toFixed(4)} < α=${SIM_PASS2_ALPHA} — the early window the player saw is anomalously player-unfavourable`)
      + `; ${faNote17}`,
    {
      epochs: recomputedRows, aggEarlyZ: aggZ, aggEarlyP: aggP,
      directionBelow: below, directionAbove: above, minDetectablePerBetPct,
      falseAlarm: {
        failCap: FAIL_FALSE_ALARM_CAP, rate: PASS2_FALSE_ALARM.rate, standardError: PASS2_FALSE_ALARM.standardError,
        nominal: SIM_PASS2_ALPHA, replicates: PASS2_FALSE_ALARM.replicates, seed: PASS2_FALSE_ALARM.seed,
        method: PASS2_FALSE_ALARM.method,
      },
    },
  );

  return [s16, s17];
}
