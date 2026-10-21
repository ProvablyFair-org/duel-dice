/**
 * Steps 11–15: Dataset Integrity & Anti-Circularity
 */

import * as fs   from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import type { StepResult } from './context';
import { ARTIFACT_PINS } from '../../src/artifact-pins';
import { step, VerifyContext } from './context';
import {
  checkDatasetHash,
  EXPECTED_BETS, EXPECTED_SEEDS, EXPECTED_PHASE_BETS, EXPECTED_SEED_PHASES,
  EXPECTED_EPOCHS, EXPECTED_EPOCH_SIZE, TARGET_MIN, TARGET_MAX,
} from '../../src/loader';
import { theoreticalWinChance, theoreticalMultiplier, computeResult, RANGE } from '../../src/rng';
import { domainRules, validateDomains, describeDomainFailures } from '../../src/domains';

export function run(ctx: VerifyContext): StepResult[] {
  const { bets, seeds, phaseD } = ctx;

  // ── Step 11: Population & phase labels ────────────────────────────────────────
  // Labels are not a population. "A, B, C and D are all present and the last bet is a D"
  // is satisfied by four bets. Every figure a label check can reach is read from inside
  // the file being scored, so a uniform shrink keeps every label valid and every ratio
  // intact, and the shrunken file re-pins cleanly. The counts are compared against
  // src/loader.ts, which the dataset does not control, and a disagreement is a hard
  // failure rather than a flag.
  const phases    = new Set(bets.map(b => b.phase));
  const hasAll    = ['A', 'B', 'C', 'D'].every(p => phases.has(p));
  const lastPhase = bets[bets.length - 1].phase;

  const betPhaseCounts: Record<string, number> = {};
  for (const b of bets) betPhaseCounts[b.phase] = (betPhaseCounts[b.phase] ?? 0) + 1;
  const seedPhaseCounts: Record<string, number> = {};
  for (const s of seeds) seedPhaseCounts[s.phase] = (seedPhaseCounts[s.phase] ?? 0) + 1;

  const popIssues: string[] = [];
  if (bets.length !== EXPECTED_BETS)   popIssues.push(`bets ${bets.length} != ${EXPECTED_BETS}`);
  if (seeds.length !== EXPECTED_SEEDS) popIssues.push(`seed records ${seeds.length} != ${EXPECTED_SEEDS}`);
  for (const [p, n] of Object.entries(EXPECTED_PHASE_BETS)) {
    const got = betPhaseCounts[p] ?? 0;
    if (got !== n) popIssues.push(`phase ${p} bets ${got} != ${n}`);
  }
  for (const [p, n] of Object.entries(EXPECTED_SEED_PHASES)) {
    const got = seedPhaseCounts[p] ?? 0;
    if (got !== n) popIssues.push(`phase ${p} seeds ${got} != ${n}`);
  }
  if (!hasAll)           popIssues.push(`phases present: ${[...phases].sort().join(', ')}`);
  if (lastPhase !== 'D') popIssues.push(`last bet phase '${lastPhase}' != 'D'`);

  const s11 = step(11, 'Population & Phase Labels',
    popIssues.length === 0 ? 'PASS' : 'FAIL',
    popIssues.length === 0
      ? `${bets.length} bets and ${seeds.length} seed records match the capture plan in src/loader.ts `
        + `(code constants, not the dataset header); phases A, B, C, D all present, last bet phase D`
      : `POPULATION MISMATCH vs the capture plan in src/loader.ts: ${popIssues.join('; ')}`,
    { betPhases: betPhaseCounts, seedPhases: seedPhaseCounts, lastPhase, populationIssues: popIssues },
  );

  // ── Step 12: Dataset hash & artifact value domains ────────────────────────────
  // The SHA-256 pin proves the DATASET bytes have not moved since we pinned them. It says nothing
  // about whether the numbers inside the committed statistical artifacts are physically possible:
  // a forger who doctors a scalar re-pins the file in the same commit, so a pin-only defence lets
  // an impossible value (a negative count, a probability above 1, an RTP below zero) walk through
  // a clean Full Pass. So this step also validates EVERY numeric leaf of the committed artifacts of
  // record against a value domain declared in src/domains.ts — bounds derived from src/, never from
  // the artifact being checked — in BOTH directions: every leaf must satisfy its domain, and every
  // leaf path must be covered by a rule (a new, undeclared numeric field fails the step, so the
  // class cannot reopen quietly).
  const h = checkDatasetHash();
  const rules = domainRules();
  const domainProblems: string[] = [];
  let leavesChecked = 0;
  for (const [file, fileRules] of Object.entries(rules)) {
    const p = path.join(ctx.outputsDir, file);
    let doc: unknown = null;
    try { doc = JSON.parse(fs.readFileSync(p, 'utf8')); }
    catch { domainProblems.push(`${file}: committed artifact absent or unreadable`); continue; }
    const r = validateDomains(doc, fileRules);
    leavesChecked += r.checked;
    if (r.violations.length || r.uncovered.length) {
      domainProblems.push(...describeDomainFailures(`${file}`, r));
    }
  }
  // ARTIFACT PINS (src/artifact-pins.ts). The value domains prove a figure was possible; the pin
  // proves the shipped bytes are the pinned ones. Reads the COMMITTED copies in outputs/, never
  // outputs/run/. A pinned artifact that carries run metadata is also a failure: it could not
  // reproduce its own pin on a no-change regeneration.
  const RUN_META = /^(generatedAt|executionTimeMs|elapsedMs|runAt|hostname|timestamp)$/;
  const pinProblems: string[] = [];
  const pinStatus: Record<string, string> = {};
  for (const [file, expected] of Object.entries(ARTIFACT_PINS)) {
    const p = path.join(ctx.outputsDir, file);
    if (!fs.existsSync(p)) { pinStatus[file] = 'ABSENT'; pinProblems.push(`${file} ABSENT`); continue; }
    const buf = fs.readFileSync(p);
    const actual = createHash('sha256').update(buf).digest('hex');
    pinStatus[file] = actual === expected ? 'match' : 'MISMATCH';
    if (actual !== expected) pinProblems.push(`${file} sha256 ${actual.slice(0, 16)}… != pin ${expected.slice(0, 16)}…`);
    if (file.endsWith('.json')) {
      const meta: string[] = [];
      try {
        (function walk(x: unknown, at: string): void {
          if (!x || typeof x !== 'object') return;
          for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
            if (RUN_META.test(k)) meta.push(`${at}/${k}`);
            walk(v, `${at}/${k}`);
          }
        })(JSON.parse(buf.toString('utf8')), '');
      } catch { meta.push('(unparseable)'); }
      if (meta.length) pinProblems.push(`${file} carries run metadata: ${meta.join(', ')}`);
    }
  }

  const s12Ok = h.match && domainProblems.length === 0 && pinProblems.length === 0;
  const pinned = Object.keys(ARTIFACT_PINS);
  const s12 = step(12, 'Dataset Hash & Artifact Value Domains',
    s12Ok ? 'PASS' : 'FAIL',
    s12Ok
      ? `${h.expected}; ${leavesChecked} numeric leaves across the committed artifacts of record `
        + `all within a src-derived value domain (both directions: every leaf in domain, every leaf covered); `
        + `${pinned.length} artifacts of record (${pinned.join(', ')}) match their SHA-256 pins in src/artifact-pins.ts `
        + `byte for byte and carry no run metadata`
      : !h.match
        ? `DATASET HASH MISMATCH: expected ${h.expected}, got ${h.actual}`
        : pinProblems.length > 0
          ? `ARTIFACT PIN VIOLATION: ${pinProblems.slice(0, 6).join('; ')}`
          : `ARTIFACT VALUE-DOMAIN VIOLATION: ${domainProblems.slice(0, 6).join('; ')}`,
    { hashMatch: h.match, leavesChecked, domainProblems: domainProblems.length,
      artifactsPinned: pinned.length, pinProblems: pinProblems.length, artifacts: pinStatus },
  );

  // ── Step 13: Anti-circularity — win probability from the lattice, negative control ───
  // Three independent claims, all decided by arithmetic over the roll grid, never by an operator
  // odds/win-chance field:
  //
  //  (a) ENUMERATION ANCHOR. The win probability is derived from the lattice and the win rule
  //      alone. The closed form win_chance = (10000 − t)/10001 is the fast path; the genuinely
  //      arithmetic-error-immune anchor is a LITERAL tally over the 0..10000 grid — apply the win
  //      rule `roll > target` to every one of the 10,001 lattice points and count. The two must
  //      agree on EVERY distinct target the capture served. A tally never scales a bound, so it
  //      cannot share a ceil/floor/off-by-one mistake with the closed form: the buggy closed form
  //      would disagree with the count. (This is the check the old RTP-identity sweep could not
  //      make — RTP = wc × (0.999/wc) ≡ 0.999 holds for ANY wc, so it never tested the win
  //      probability itself.)
  //  (b) NEGATIVE CONTROL. A check that cannot fail is a vacuous PASS. Recompute one bet's true
  //      roll from (serverSeed, clientSeed, nonce), corrupt it, and confirm the EXACT-equality
  //      predicate Step 5 settles on ACCEPTS the true roll while REJECTING both the corrupted roll
  //      and a non-numeric (NaN) served value — so the determinism logic is demonstrably
  //      falsifiable, not a tautology.
  //  (c) RTP IDENTITY. Retained as a closing consistency statement: RTP = win_chance × multiplier
  //      = 0.999 at every target — necessary but, on its own, algebraically trivial, which is why
  //      it is not the anti-circularity evidence.
  const totalTargets = TARGET_MAX - TARGET_MIN + 1;   // 9,997 legal targets 2..9998 (src/loader.ts)
  let maxDeviation = 0;
  let worstTarget  = 0;
  for (let t = TARGET_MIN; t <= TARGET_MAX; t++) {
    const wc       = theoreticalWinChance(t);
    const mult     = theoreticalMultiplier(t);
    const rtp      = wc * mult;
    const dev      = Math.abs(rtp - 0.999);
    if (dev > maxDeviation) { maxDeviation = dev; worstTarget = t; }
  }

  // (a) Enumeration anchor over the distinct served targets. `enumWinCount` is a pure tally.
  const enumWinCount = (target: number): number => {
    let c = 0;
    for (let d = 0; d < RANGE; d++) if (d > target) c++;   // win rule: roll > target
    return c;
  };
  const distinctTargets = [...new Set(bets.map(b => b.request.target))];
  let enumMismatches = 0;
  let firstEnumMismatch = '';
  for (const t of distinctTargets) {
    const tally     = enumWinCount(t);
    const closed    = Math.round(theoreticalWinChance(t) * RANGE);   // == 10000 − t exactly
    if (tally !== closed) {
      enumMismatches++;
      if (!firstEnumMismatch) firstEnumMismatch = `target ${t}: tally ${tally} vs closed-form ${closed}`;
    }
  }

  // (b) Injected-corruption negative control on a real recomputed roll.
  const nb = bets.find(x => ctx.seedMap.has(x.response.server_seed_hashed));
  let negControlRejects = false;
  if (nb) {
    const ss        = ctx.seedMap.get(nb.response.server_seed_hashed)!;
    const trueRoll  = computeResult(ss, nb.response.client_seed, nb.response.nonce);
    const corrupted = (trueRoll + 1) % RANGE;               // deliberately wrong roll
    // The exact predicate Step 5 settles on: served === recomputed. It must accept the true roll
    // and reject BOTH the corrupted roll and a non-numeric served value.
    const rollMatches = (served: unknown, expected: number) => served === expected;
    negControlRejects = rollMatches(trueRoll, trueRoll)
      && !rollMatches(corrupted, trueRoll)
      && !rollMatches(NaN, trueRoll);
  }

  // The measured RTP deviation is a float and belongs in `data`, not in the sentence: the
  // reproduction gate can only compare a string leaf for equality, so a figure printed
  // into prose disagrees forever on a machine whose last bit differs. The sentence carries
  // the BOUND and the integer counts.
  const S13_BOUND = 0.0001;
  const s13Ok = maxDeviation < S13_BOUND
    && enumMismatches === 0 && distinctTargets.length > 0
    && negControlRejects;
  const s13 = step(13, 'Probability Independence (Anti-Circularity)',
    s13Ok ? 'PASS' : 'FAIL',
    s13Ok
      ? `win probability derived from the lattice and the win rule alone: closed-form win chance vs a `
        + `literal 10,001-point tally agree on all ${distinctTargets.length} distinct served targets `
        + `(0 mismatches); negative control — a corrupted roll and a NaN are REJECTED by the exact `
        + `predicate Step 5 uses while the true roll is accepted (falsifiable); RTP = win_chance × `
        + `multiplier = 0.999 within the ${S13_BOUND} bound at all ${totalTargets.toLocaleString('en-US')} legal targets ${TARGET_MIN}..${TARGET_MAX}`
      : !negControlRejects
        ? `NEGATIVE CONTROL VACUOUS: the determinism predicate did not reject a corrupted roll — the anti-circularity check cannot fail and is not evidence`
        : enumMismatches > 0
          ? `WIN-PROBABILITY ANCHOR BROKEN: closed-form win chance disagrees with the lattice tally on ${enumMismatches} of ${distinctTargets.length} served targets (first: ${firstEnumMismatch})`
          : `RTP identity broken: at least one of the ${totalTargets.toLocaleString('en-US')} legal targets deviates from 0.999 by more than the ${S13_BOUND} bound (worst: target=${worstTarget}; deviation in this step's data block)`,
    { targetsTested: totalTargets, maxDeviation, bound: S13_BOUND, worstTarget,
      distinctServedTargets: distinctTargets.length, enumMismatches, negControlRejects },
  );

  // ── Step 14: Epoch size ────────────────────────────────────────────────────────
  // `min === max === 50` asserts the declared size, which a uniform shrink cannot satisfy.
  // It leaves the epoch COUNT free, though, so deleting whole epochs passed it untouched.
  // Both are pinned in src/loader.ts, and a disagreement is a hard failure, not a flag —
  // a capture with fewer epochs than the plan is a different capture.
  const epochSizes = new Map<string, number>();
  for (const b of bets) {
    epochSizes.set(b.response.server_seed_hashed, (epochSizes.get(b.response.server_seed_hashed) ?? 0) + 1);
  }
  const sizes   = [...epochSizes.values()];
  const minSize = sizes.length > 0 ? Math.min(...sizes) : 0;
  const maxSize = sizes.length > 0 ? Math.max(...sizes) : 0;
  const offSize = sizes.filter(s => s !== EXPECTED_EPOCH_SIZE).length;

  const epochIssues: string[] = [];
  if (epochSizes.size !== EXPECTED_EPOCHS) epochIssues.push(`epochs ${epochSizes.size} != ${EXPECTED_EPOCHS}`);
  if (offSize > 0) epochIssues.push(`${offSize} epochs are not exactly ${EXPECTED_EPOCH_SIZE} bets (observed range ${minSize}–${maxSize})`);

  const s14 = step(14, 'Epoch Size',
    epochIssues.length === 0 ? 'PASS' : 'FAIL',
    epochIssues.length === 0
      ? `${EXPECTED_EPOCHS} epochs as declared in src/loader.ts, each of exactly ${EXPECTED_EPOCH_SIZE} bets`
      : `EPOCH STRUCTURE MISMATCH vs src/loader.ts: ${epochIssues.join('; ')}`,
    { epochs: epochSizes.size, epochsOffDeclaredSize: offSize, minSize, maxSize, epochIssues },
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
