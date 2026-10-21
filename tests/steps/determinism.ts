/**
 * Steps 5–6: RNG Determinism
 *
 * Step 5 carries four legs: the package's own recomputation (DICE-07; src/rng.ts, rebuilt from the
 * written spec docs/ALGORITHM.md), Duel's own Verify-tab code run as a second check (DICE-09), and the two ProvablyFair.org player verifiers — the docs-site derive.js and the live
 * www.provablyfair.org/verify-bets bundle (DICE-24) — each executed from pinned bytes on every bet.
 */

import type { StepResult } from './context';
import { step, VerifyContext } from './context';
import { computeResultFromBuffer, computeResult, RANGE, MAX_FAIR } from '../../src/rng';
import {
  runOperatorVerifier, rollUnits, OPERATOR_EXPECTED_LOGS, OPERATOR_VERIFIER_PROVENANCE,
} from '../../src/operator-verifier';
import { EXPECTED_BETS, EXPECTED_EPOCHS } from '../../src/loader';
import { theoreticalWinChance, theoreticalMultiplier } from '../../src/rng';
import { loadSiteVerifier, SITE_VERIFIER_PROVENANCE } from '../../src/site-verifier';
import { runLiveSiteVerifier, liveRollUnits, LIVE_SITE_PROVENANCE } from '../../src/live-site-verifier';
import { binomialTailAtLeast, FAIL_FALSE_ALARM_CAP, rate4, fmtRate } from '../../src/false-alarm';

export function run(ctx: VerifyContext): StepResult[] {
  const { bets, seedMap } = ctx;

  // ── Step 5: Result recomputation ─────────────────────────────────────────────
  // DICE-07 has two conjuncts, and the second used to be left to Step 11. First, every bet with a
  // revealed seed must recompute to its recorded roll by EXACT INTEGER equality on the 0..10000
  // lattice (no tolerance — the lattice is the comparison). Second, COVERAGE MUST EQUAL THE AUDITED
  // POPULATION: the number of bets actually recomputed must equal identity.dataset.expectedBets. A
  // bet that cannot be recomputed — its server seed unrevealed, so the roll cannot be reproduced
  // from (serverSeed, clientSeed, nonce) — is a FAIL of THIS step, not a silent exclusion. An audit
  // that quietly dropped the bets it could not reproduce would print a Full Pass over a fraction of
  // the capture. In this capture the 138 seed records reveal 134 commitments, one for every epoch
  // with bets, so every one of the 6,700 bets recomputes and skipped = 0; the guard exists for the
  // capture where that is not true.
  let mismatches = 0;
  let skipped    = 0;
  for (const b of bets) {
    const ss = seedMap.get(b.response.server_seed_hashed);
    if (!ss) { skipped++; continue; }
    const key      = Buffer.from(ss, 'hex');
    const computed = computeResultFromBuffer(key, b.response.client_seed, b.response.nonce);
    if (computed !== b.response.result) mismatches++;
  }
  ctx.step5Mismatches = mismatches;
  ctx.step5Skipped    = skipped;
  const recomputed = bets.length - skipped;

  // ── Step 5, operator leg: THE OPERATOR'S OWN Verify-tab code (DICE-09), a SECOND CHECK ─────
  // src/rng.ts is rebuilt from the written spec docs/ALGORITHM.md, not from this code; Duel's file is
  // run here as an independent cross-check of that rebuild and of the served rolls, never as its source.
  // Duel's Dice code panel (duel.com → Provably Fair → Verify → Expand → Copy, 2026-09-25) is
  // vendored verbatim under evidence/verify-tab/ and pinned in src/operator-verifier.ts. Its own
  // validateDiceResult is EXECUTED unmodified on every bet. It returns a display string,
  // ((value % RANGE) / 100).toString(); rollUnits maps it onto the 0..10000 lattice and REJECTS any
  // string that is not exactly String(units / 100), so the comparison is exact integer equality —
  // with the served roll AND with src/rng.ts. Its RANGE and MAX_FAIR constants must equal src/rng.ts's,
  // and it must print only its empty-input message. HARD FAIL otherwise, or on a count other than
  // EXPECTED_BETS.
  const opIssues: string[] = [];
  const opRounds: Array<{ id: string; serverSeed: string; clientSeed: string; nonce: number }> = [];
  bets.forEach((b, i) => {
    const ss = seedMap.get(b.response.server_seed_hashed);
    if (ss) opRounds.push({ id: String(i), serverSeed: ss, clientSeed: b.response.client_seed, nonce: b.response.nonce });
  });
  const op = runOperatorVerifier(opRounds);
  let opChecked = 0, opVsServed = 0, opVsRng = 0, opOffGrid = 0;
  const opFirst: string[] = [];
  if (!op.results) {
    opIssues.push(`operator Verify-tab code: ${op.error}`);
  } else {
    const logsOk = op.logs.length === OPERATOR_EXPECTED_LOGS.length && op.logs.every((l, i) => l === OPERATOR_EXPECTED_LOGS[i]);
    if (!logsOk) opIssues.push(`operator Verify-tab code printed ${JSON.stringify(op.logs).slice(0, 200)} — not only its empty-input message`);
    if (op.range !== RANGE || op.maxFair !== MAX_FAIR) opIssues.push(`operator RANGE/MAX_FAIR ${op.range}/${op.maxFair} != src/rng.ts ${RANGE}/${MAX_FAIR}`);
    bets.forEach((b, i) => {
      const raw = op.results!.get(String(i));
      if (raw === undefined) return;
      opChecked++;
      const units = rollUnits(raw);
      if (units === null) opOffGrid++;
      const ss = seedMap.get(b.response.server_seed_hashed)!;
      const mine = computeResult(ss, b.response.client_seed, b.response.nonce);
      if (units !== b.response.result) { opVsServed++; if (opFirst.length < 3) opFirst.push(`bet ${b.response.id}: operator "${raw}" vs served ${b.response.result}`); }
      if (units !== mine) { opVsRng++; if (opFirst.length < 3) opFirst.push(`bet ${b.response.id}: operator "${raw}" vs src/rng.ts ${mine}`); }
    });
    if (opChecked !== EXPECTED_BETS) opIssues.push(`operator Verify-tab code ran on ${opChecked} bets, ${EXPECTED_BETS} declared`);
    if (opVsServed + opVsRng + opOffGrid > 0) {
      opIssues.unshift(`operator Verify-tab code disagrees: with the served roll on ${opVsServed}, with src/rng.ts on ${opVsRng}, `
        + `off the /100 lattice on ${opOffGrid} bet(s) (${opFirst.join('; ')})`);
    }
  }

  // ── Step 5, docs-site leg: the ProvablyFair.org VerifyBets derive.js (DICE-24) ─────
  // The docs site's Dice verifier (games/dice/derive.js + its one import lib/hmac-sha256.js,
  // mikepforg/pf-audit-duel origin/main @ bd4d59c, read with git cat-file) is vendored byte for byte
  // under verifier-parity/ and pinned in src/site-verifier.ts. Its own deriveDice is EXECUTED on every
  // captured bet. SCORED, each on all EXPECTED_BETS bets: (1) its roll equals the served roll AND
  // src/rng.ts, exact integer equality; (2) its isWin equals the served is_win; (3) its winChance is
  // bit-identical to src/rng.ts theoreticalWinChance(target); (4) on a win its multiplier is within
  // ONE ULP of src/rng.ts theoreticalMultiplier(target) — the value Step 9 binds to the served
  // multiplier on the 1e-18 grid — and on a loss it is 0 (the page prints "0×"). Why one ulp and not
  // bit-identity (since v1.2.0): src/rng.ts, rebuilt from docs/ALGORITHM.md, computes 9990999 / (1000 ·
  // count), one IEEE division of two exact integers, i.e. the correctly rounded double of the exact
  // multiplier. derive.js computes 0.999 / winChance, two roundings, and lands one ulp away on 2,620 of
  // the 9,997 legal targets (593 of the 2,519 captured wins). The v1.1.0 port used derive.js's form, so
  // the two were bit-identical then. A difference of more than one ulp still FAILs; the one-ulp count
  // is RECORDED. RECORDED, not scored:
  // the page shows the multiplier as toFixed(4); where the served 18-dp multiplier sits exactly on a
  // 4-dp half, the nearest double lies below it and the page prints the lower digit — no rounding rule
  // for a 4-dp display is declared by the operator, so the count is printed, not judged.
  const siteIssues: string[] = [];
  const sv = loadSiteVerifier();
  let siteChecked = 0, siteRollVsServed = 0, siteRollVsRng = 0, siteWinFlag = 0, siteWinChance = 0, siteMult = 0, siteThrew = 0;
  let siteWins = 0, siteDisplayTies = 0, siteDisplayLowerOnTie = 0, siteMultOneUlp = 0;
  const ulpDistance = (a: number, b: number): number => {
    if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return a === b ? 0 : Infinity;
    const v = new BigInt64Array(new Float64Array([a, b]).buffer);
    const d = v[0] - v[1];
    return Number(d < 0n ? -d : d);
  };
  const siteFirst: string[] = [];
  const displayTieExamples: string[] = [];
  if (sv.error || !sv.deriveDice) {
    siteIssues.push(`docs-site verifier: ${sv.error ?? 'not loaded'}`);
  } else {
    for (const b of bets) {
      const ss = seedMap.get(b.response.server_seed_hashed);
      if (!ss) continue;
      let r: ReturnType<NonNullable<typeof sv.deriveDice>>;
      try {
        r = sv.deriveDice({ clientSeed: b.response.client_seed, serverSeed: ss, nonce: b.response.nonce,
          target: b.request.target, betType: b.request.bet_type });
      } catch { siteThrew++; continue; }
      siteChecked++;
      const mine = computeResult(ss, b.response.client_seed, b.response.nonce);
      if (r.result !== b.response.result) { siteRollVsServed++; if (siteFirst.length < 3) siteFirst.push(`bet ${b.response.id}: site ${r.result} vs served ${b.response.result}`); }
      if (r.result !== mine) { siteRollVsRng++; if (siteFirst.length < 3) siteFirst.push(`bet ${b.response.id}: site ${r.result} vs src/rng.ts ${mine}`); }
      if (r.isWin !== b.response.is_win) { siteWinFlag++; if (siteFirst.length < 3) siteFirst.push(`bet ${b.response.id}: site isWin ${r.isWin} vs served ${b.response.is_win}`); }
      if (r.winChance !== theoreticalWinChance(b.request.target)) siteWinChance++;
      if (b.response.is_win) {
        siteWins++;
        const ulps = ulpDistance(r.multiplier, theoreticalMultiplier(b.request.target));
        if (ulps === 1) siteMultOneUlp++;
        if (ulps > 1) { siteMult++; if (siteFirst.length < 3) siteFirst.push(`bet ${b.response.id}: site multiplier ${r.multiplier} vs src/rng.ts ${theoreticalMultiplier(b.request.target)}`); }
        const frac = (b.response.multiplier.split('.')[1] ?? '').padEnd(18, '0');
        if (frac.slice(4) === '5'.padEnd(14, '0')) {
          siteDisplayTies++;
          const shown = r.multiplier.toFixed(4);
          if (shown.endsWith(frac.slice(3, 4))) siteDisplayLowerOnTie++;
          if (displayTieExamples.length < 4) displayTieExamples.push(`served ${b.response.multiplier} → page ${shown}×`);
        }
      } else if (r.multiplier !== 0) { siteMult++; if (siteFirst.length < 3) siteFirst.push(`bet ${b.response.id}: site multiplier ${r.multiplier} on a loss`); }
    }
    if (siteThrew > 0) siteIssues.push(`docs-site verifier threw on ${siteThrew} bet(s)`);
    if (siteChecked !== EXPECTED_BETS) siteIssues.push(`docs-site verifier ran on ${siteChecked} bets, ${EXPECTED_BETS} declared`);
    if (siteRollVsServed + siteRollVsRng + siteWinFlag + siteWinChance + siteMult > 0) {
      siteIssues.push(`docs-site verifier disagrees: roll vs served ${siteRollVsServed}, roll vs src/rng.ts ${siteRollVsRng}, `
        + `win flag ${siteWinFlag}, win chance ${siteWinChance}, multiplier ${siteMult} (${siteFirst.join('; ')})`);
    }
  }

  // ── Step 5, live-site leg: www.provablyfair.org/verify-bets (DICE-24) ─────────────
  // The page a player opens is a separate Next.js build whose source is not available to this audit.
  // Its deployed bundle (3 chunks) is vendored byte for byte under verifier-parity/live-site/ and pinned
  // with the runner in src/live-site-verifier.ts; the site's own code (VERIFY → verifyDuelsGame → the
  // Duel Dice derivation, WebCrypto HMAC-SHA-256) is EXECUTED on every bet. SCORED on all EXPECTED_BETS
  // bets: the roll Number it returns, mapped exactly onto the 0..10000 lattice (liveRollUnits rejects a
  // Number that is not exactly units / 100), equals the served roll AND src/rng.ts; and the server-seed
  // hash it prints equals the served server_seed_hashed commitment. The page computes no win flag and
  // no multiplier for Duel Dice.
  const liveIssues: string[] = [];
  const liveRounds: Array<{ id: string; serverSeed: string; clientSeed: string; nonce: number; diceTarget: number; diceMode: string }> = [];
  bets.forEach((b, i) => {
    const ss = seedMap.get(b.response.server_seed_hashed);
    if (ss) liveRounds.push({ id: String(i), serverSeed: ss, clientSeed: b.response.client_seed, nonce: b.response.nonce,
      diceTarget: b.request.target / 100, diceMode: b.request.bet_type });
  });
  const live = runLiveSiteVerifier('Duel.com', liveRounds);
  let liveChecked = 0, liveVsServed = 0, liveVsRng = 0, liveOffGrid = 0, liveHash = 0, liveMissing = 0;
  const liveFirst: string[] = [];
  if (live.error || !live.rolls || !live.seedHashes) {
    liveIssues.push(`live-site verifier: ${live.error ?? 'no result'}`);
  } else {
    bets.forEach((b, i) => {
      const x = live.rolls!.get(String(i));
      if (x === undefined || x === null) { liveMissing++; return; }
      liveChecked++;
      const units = liveRollUnits(x);
      if (units === null) liveOffGrid++;
      const ss = seedMap.get(b.response.server_seed_hashed)!;
      const mine = computeResult(ss, b.response.client_seed, b.response.nonce);
      if (units !== b.response.result) { liveVsServed++; if (liveFirst.length < 3) liveFirst.push(`bet ${b.response.id}: site ${x} vs served ${b.response.result}`); }
      if (units !== mine) { liveVsRng++; if (liveFirst.length < 3) liveFirst.push(`bet ${b.response.id}: site ${x} vs src/rng.ts ${mine}`); }
      if (live.seedHashes!.get(String(i)) !== b.response.server_seed_hashed) liveHash++;
    });
    if (liveMissing > 0) liveIssues.push(`live-site verifier returned no roll for ${liveMissing} bet(s)`);
    if (liveChecked !== EXPECTED_BETS) liveIssues.push(`live-site verifier ran on ${liveChecked} bets, ${EXPECTED_BETS} declared`);
    if (liveVsServed + liveVsRng + liveOffGrid + liveHash > 0) {
      liveIssues.push(`live-site verifier disagrees: roll vs served ${liveVsServed}, vs src/rng.ts ${liveVsRng}, off the /100 lattice `
        + `${liveOffGrid}, server-seed hash vs served commitment ${liveHash} (${liveFirst.join('; ')})`);
    }
  }

  const s5Ok = mismatches === 0 && recomputed === EXPECTED_BETS && opIssues.length === 0
    && siteIssues.length === 0 && liveIssues.length === 0;
  const s5 = step(5, 'Result Recomputation (RNG + drand absent)',
    s5Ok ? 'PASS' : 'FAIL',
    s5Ok
      ? `${recomputed}/${EXPECTED_BETS} bets recomputed to their recorded roll by exact integer `
        + `equality on the 0..10000 lattice by src/rng.ts, rebuilt from the written spec docs/ALGORITHM.md `
        + `(${mismatches} mismatches, ${skipped} skipped); coverage `
        + `equals the audited population expectedBets = ${EXPECTED_BETS}. Operator-code parity (DICE-09), a second check `
        + `and not the source of src/rng.ts: Duel's own Dice Verify-tab code (${OPERATOR_VERIFIER_PROVENANCE.savedAs}, copied ${OPERATOR_VERIFIER_PROVENANCE.copiedOn}, SHA-256-pinned) `
        + `executed unmodified on ${opChecked}/${EXPECTED_BETS} bets — its displayed roll, mapped exactly onto the 0..10000 lattice, `
        + `equals the served roll and src/rng.ts on every bet (${opVsServed} / ${opVsRng} differ, ${opOffGrid} off-grid); its RANGE `
        + `${op.range} and MAX_FAIR ${op.maxFair} equal src/rng.ts. Player-verifier parity (DICE-24): the `
        + `ProvablyFair.org docs-site verifier (VerifyBets games/dice/derive.js + lib/hmac-sha256.js, `
        + `${SITE_VERIFIER_PROVENANCE.ref} @ ${SITE_VERIFIER_PROVENANCE.head.slice(0, 7)}, ${sv.files.filter(f => f.match).length}/`
        + `${sv.files.length} SHA-256 pins MATCH) executed on ${siteChecked}/${EXPECTED_BETS} bets: roll equal to the served roll and `
        + `src/rng.ts on every bet (${siteRollVsServed} / ${siteRollVsRng} differ), win flag equal to the served is_win `
        + `(${siteWinFlag} differ), win chance bit-identical to src/rng.ts (${siteWinChance} differ), multiplier within one ulp `
        + `of src/rng.ts on all ${siteWins} wins and 0 on every loss (${siteMult} differ; ${siteMultOneUlp} win(s) exactly one ulp `
        + `apart, derive.js's 0.999 / winChance against the correctly rounded 9990999 / (1000 · count)); recorded, not scored: on `
        + `${siteDisplayTies} win(s) the served multiplier sits exactly on a 4-dp half and the page's toFixed(4) prints the lower `
        + `digit on ${siteDisplayLowerOnTie}. Live-site parity (DICE-24): the deployed ${LIVE_SITE_PROVENANCE.page} bundle `
        + `(3 chunks + runner, ${live.files.filter(f => f.match).length}/${live.files.length} SHA-256 pins MATCH) executed on `
        + `${liveChecked}/${EXPECTED_BETS} bets: roll equal to the served roll and src/rng.ts on every bet (${liveVsServed} / `
        + `${liveVsRng} differ, ${liveOffGrid} off-grid), printed server-seed hash equal to the served commitment on every bet `
        + `(${liveHash} differ)`
      : (opIssues.length > 0 || siteIssues.length > 0 || liveIssues.length > 0) && mismatches === 0 && recomputed === EXPECTED_BETS
        ? [
            opIssues.length > 0 ? `OPERATOR VERIFY-TAB CODE PARITY (DICE-09): ${opIssues.join('; ')}` : '',
            siteIssues.length > 0 ? `SITE VERIFIER PARITY (DICE-24): ${siteIssues.join('; ')}` : '',
            liveIssues.length > 0 ? `LIVE-SITE VERIFIER PARITY (DICE-24): ${liveIssues.join('; ')}` : '',
          ].filter(Boolean).join(' | ')
      : mismatches > 0
        ? `${recomputed - mismatches}/${recomputed} recomputed exactly, ${mismatches} MISMATCH — a roll the declared algorithm does not produce for its seed`
        : `RECOMPUTATION COVERAGE SHORTFALL: ${recomputed} bets recomputed but expectedBets = ${EXPECTED_BETS} `
          + `(${skipped} skipped — a bet whose server seed is unrevealed cannot be recomputed and is a FAIL of this step, not an exclusion)`,
    { recomputed, expectedBets: EXPECTED_BETS, mismatches, skipped,
      operatorVerifier: {
        files: op.files.map(f => ({ file: f.file, pinnedSha256: f.pinned, actualSha256: f.actual, match: f.match })),
        provenance: OPERATOR_VERIFIER_PROVENANCE, betsExecuted: opChecked, disagreeWithServed: opVsServed,
        disagreeWithRng: opVsRng, offGrid: opOffGrid, operatorRange: op.range, operatorMaxFair: op.maxFair,
        issues: opIssues,
      },
      siteVerifier: {
        files: sv.files.map(f => ({ file: f.file, pinnedSha256: f.pinned, vendoredSha256: f.actual, match: f.match })),
        provenance: SITE_VERIFIER_PROVENANCE, betsExecuted: siteChecked, expectedBets: EXPECTED_BETS,
        rollDiffersFromServed: siteRollVsServed, rollDiffersFromRng: siteRollVsRng, winFlagDiffers: siteWinFlag,
        winChanceDiffersFromRng: siteWinChance, multiplierDiffersFromRng: siteMult, multiplierOneUlpFromRng: siteMultOneUlp,
        threw: siteThrew, wins: siteWins,
        displayFourDpTies: siteDisplayTies, displayLowerDigitOnTie: siteDisplayLowerOnTie, displayTieExamples,
        issues: siteIssues,
      },
      liveSiteVerifier: {
        files: live.files.map(f => ({ file: f.file, pinnedSha256: f.pinned, vendoredSha256: f.actual, match: f.match })),
        provenance: LIVE_SITE_PROVENANCE, betsExecuted: liveChecked, expectedBets: EXPECTED_BETS,
        rollDiffersFromServed: liveVsServed, rollDiffersFromRng: liveVsRng, offGrid: liveOffGrid,
        seedHashDiffersFromCommitment: liveHash, missing: liveMissing, standInModules: live.standIns.length,
        issues: liveIssues,
      } },
  );

  // ── Step 6: Client seed influence (model-rate gate + empty-seed control) ─────
  // Substituting a wrong client seed must change the roll — but it cannot be required to change it
  // EVERY time. The roll lives on a 10,001-point lattice, so two independent client seeds land on
  // the same roll with probability 1/RANGE = 1/10001 however good the RNG is (the draw is exactly
  // uniform — Step 19 proves the bias is 0). The former rule, `changed / tested > 0.95`, forgave up
  // to one bet in twenty being insensitive to the client seed — the exact defect this step exists
  // to detect. Collisions are now held to the rate the lattice predicts: E = Σ p over the sampled
  // bets with p = 1/RANGE, bound E + 5σ + 1 (σ² = Σ p(1 − p)), the framework's bound for a sparse
  // count. An RNG that ignored the client seed would collide on every sampled bet.
  // (Mechanism ported from Duel Mines Step 6, where p = 1/C(25, m).)
  const WRONG_CLIENT = 'wrong-client-seed-test';
  const SAMPLE_PER_EPOCH = 5;
  const P_COLLIDE = 1 / RANGE;
  let tested  = 0;
  let changed = 0;
  let collisions = 0, expectedCollisions = 0, collisionVariance = 0;
  const byEpoch = new Map<string, typeof bets>();
  for (const b of bets) {
    const arr = byEpoch.get(b.response.server_seed_hashed) ?? [];
    arr.push(b);
    byEpoch.set(b.response.server_seed_hashed, arr);
  }
  for (const [hash, epochBets] of byEpoch) {
    const ss = seedMap.get(hash);
    if (!ss) continue;
    const key = Buffer.from(ss, 'hex');
    for (const b of epochBets.slice(0, SAMPLE_PER_EPOCH)) {
      tested++;
      expectedCollisions += P_COLLIDE;
      collisionVariance  += P_COLLIDE * (1 - P_COLLIDE);
      const correct = computeResultFromBuffer(key, b.response.client_seed, b.response.nonce);
      const wrong   = computeResultFromBuffer(key, WRONG_CLIENT, b.response.nonce);
      if (correct !== wrong) changed++;
      else collisions++;
    }
  }
  const collisionBound = expectedCollisions + 5 * Math.sqrt(collisionVariance) + 1;

  // THE EMPTY-SEED CONTROL. A wrong client seed shows the client seed is READ; an EMPTY one is the
  // case an implementation that drops or defaults the field would reproduce. Every bet is
  // recomputed with clientSeed = "" and the collisions held to the same lattice-predicted bound.
  let emptyTested = 0, emptyCollisions = 0, emptyExpected = 0, emptyVariance = 0;
  for (const b of bets) {
    const ss = seedMap.get(b.response.server_seed_hashed);
    if (!ss) continue;
    const key = Buffer.from(ss, 'hex');
    emptyTested++;
    emptyExpected += P_COLLIDE;
    emptyVariance += P_COLLIDE * (1 - P_COLLIDE);
    const correct = computeResultFromBuffer(key, b.response.client_seed, b.response.nonce);
    const empty   = computeResultFromBuffer(key, '', b.response.nonce);
    if (correct === empty) emptyCollisions++;
  }
  const emptyBound = emptyExpected + 5 * Math.sqrt(emptyVariance) + 1;

  // The sample is bound to the declared epoch count, so a shrunken capture cannot satisfy this
  // step by testing almost nothing; the empty-seed control must cover the whole audited population.
  const expectedTested = EXPECTED_EPOCHS * SAMPLE_PER_EPOCH;
  const s6Issues: string[] = [];
  if (tested !== expectedTested) {
    s6Issues.push(`bets tested ${tested} != ${expectedTested} (${SAMPLE_PER_EPOCH} per epoch × ${EXPECTED_EPOCHS} epochs)`);
  }
  if (emptyTested !== EXPECTED_BETS) {
    s6Issues.push(`empty-seed control covered ${emptyTested} bets != ${EXPECTED_BETS}`);
  }
  if (emptyCollisions > emptyBound) {
    s6Issues.push(`EMPTY-SEED CONTROL: ${emptyCollisions} of ${emptyTested} rolls unchanged with clientSeed = "", above `
      + `the lattice bound ${emptyBound.toFixed(2)} — the roll does not depend on the client seed`);
  }
  // FALSE-ALARM RATE ON A FAIR GAME (the 2026-10-06 standard: a statistical rule may move the verdict
  // only with its rate written down, at most 1% for a FAIL). On a fair game a collision is an event of
  // probability 1/RANGE per bet, independent across bets, so each count is Binomial(bets, 1/RANGE) and
  // the rule "count > bound" fires with the exact binomial tail P(X ≥ ⌊bound⌋ + 1). The step's rate is
  // at most the sum of the two.
  const wrongFailAt = Math.floor(collisionBound) + 1;
  const emptyFailAt = Math.floor(emptyBound) + 1;
  const faWrong = binomialTailAtLeast(tested, P_COLLIDE, wrongFailAt);
  const faEmpty = binomialTailAtLeast(emptyTested, P_COLLIDE, emptyFailAt);
  const faStep  = faWrong + faEmpty;
  const faNote  = `false-alarm rate on a fair game (FAIL cap ${FAIL_FALSE_ALARM_CAP}), exact binomial: wrong seed `
    + `P(X ≥ ${wrongFailAt} | Binomial(${tested}, 1/${RANGE})) = ${fmtRate(faWrong)}, empty seed `
    + `P(X ≥ ${emptyFailAt} | Binomial(${emptyTested}, 1/${RANGE})) = ${fmtRate(faEmpty)}, step ≤ ${fmtRate(faStep)}`
    + `${faStep <= FAIL_FALSE_ALARM_CAP ? '' : ' — OVER THE CAP'}`;

  const s6Ok = collisions <= collisionBound && s6Issues.length === 0;
  const s6 = step(6, 'Client Seed Influence',
    s6Ok ? 'PASS' : 'FAIL',
    (collisions > collisionBound
      ? `${collisions} of ${tested} bets kept the SAME roll under a wrong client seed, above the lattice bound `
        + `${collisionBound.toFixed(2)} — the roll is not responding to the client seed`
      : s6Issues.length > 0
        ? `${s6Issues.join('; ')}`
        : `${SAMPLE_PER_EPOCH} bets from each of the ${EXPECTED_EPOCHS} epochs (${tested}): a wrong client seed changed `
          + `${changed}/${tested} rolls; ${collisions} collision(s) against the lattice rate E = ${tested}/${RANGE} = `
          + `${expectedCollisions.toFixed(4)}, bound E + 5σ + 1 = ${collisionBound.toFixed(2)}. Empty-seed control over all `
          + `${emptyTested} bets (clientSeed = ""): ${emptyCollisions} collision(s), E = ${emptyExpected.toFixed(4)}, `
          + `bound ${emptyBound.toFixed(2)}`) + `; ${faNote}`,
    {
      betsTested: tested, expectedTested, changed, collisions,
      expectedCollisions, collisionBound, samplePerEpoch: SAMPLE_PER_EPOCH, epochs: EXPECTED_EPOCHS,
      pCollide: P_COLLIDE,
      emptySeedControl: {
        betsTested: emptyTested, expectedTested: EXPECTED_BETS, collisions: emptyCollisions,
        expectedCollisions: emptyExpected, collisionBound: emptyBound,
      },
      falseAlarm: {
        failCap: FAIL_FALSE_ALARM_CAP, method: 'exact binomial tail',
        wrongSeed: { failAt: wrongFailAt, rate: rate4(faWrong) },
        emptySeed: { failAt: emptyFailAt, rate: rate4(faEmpty) },
        stepAtMost: rate4(faStep),
      },
    },
  );

  return [s5, s6];
}
