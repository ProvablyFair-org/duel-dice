/**
 * Steps 1–4: Commit-Reveal Integrity
 */

import type { StepResult } from './context';
import type { DiceBet } from '../../src/types';
import { step, VerifyContext } from './context';
import { verifyHash, computeResult } from '../../src/rng';
import {
  EXPECTED_SEEDS,
  EXPECTED_REVEALED_SEEDS,
  EXPECTED_SEED_TRANSITIONS,
  EXPECTED_PHASE_BOUNDARY_SKIPS,
  EXPECTED_EPOCH_SIZE,
} from '../../src/loader';

export function run(ctx: VerifyContext): StepResult[] {
  const { bets, seeds, seedMap, byHash } = ctx;

  // ── Step 1: Seed hash integrity (cross-epoch) ───────────────────────────────
  // "0 mismatches" is not a result — an empty seed list satisfies it, and so does a list
  // cut to one row. The step states how many comparisons it OWES against the population
  // in src/loader.ts and fails when it cannot make them. A seed row without plaintext is
  // counted and named rather than passed over in silence: a seed with nothing to check is
  // exactly the seed an operator would want no one to look at.
  const hashFailures: string[] = [];
  let compared = 0, phaseBoundarySkips = 0, unrevealed = 0;
  for (let i = 1; i < seeds.length; i++) {
    if (!seeds[i].seed.serverSeed) { unrevealed++; continue; }
    const match = verifyHash(seeds[i].seed.serverSeed!, seeds[i - 1].seed.serverSeedHashed);
    if (!match && seeds[i].phase !== seeds[i - 1].phase) {
      phaseBoundarySkips++;
      continue;
    }
    if (!match) {
      hashFailures.push(`seed[${i}]: SHA-256(revealed) ≠ seed[${i - 1}].serverSeedHashed`);
    }
    compared++;
  }

  const revealed = seeds.filter(s => s.seed.serverSeed).length;
  const s1Population: string[] = [];
  if (seeds.length !== EXPECTED_SEEDS) s1Population.push(`seed records ${seeds.length} != ${EXPECTED_SEEDS}`);
  if (revealed !== EXPECTED_REVEALED_SEEDS) s1Population.push(`revealed seeds ${revealed} != ${EXPECTED_REVEALED_SEEDS}`);
  if (compared + phaseBoundarySkips !== EXPECTED_SEED_TRANSITIONS) {
    s1Population.push(`transitions examined ${compared + phaseBoundarySkips} != ${EXPECTED_SEED_TRANSITIONS}`);
  }
  if (phaseBoundarySkips !== EXPECTED_PHASE_BOUNDARY_SKIPS) {
    s1Population.push(`phase-boundary skips ${phaseBoundarySkips} != ${EXPECTED_PHASE_BOUNDARY_SKIPS}`);
  }
  if (unrevealed !== 0) s1Population.push(`${unrevealed} seed rows carry no plaintext and could not be checked`);

  const s1Ok = hashFailures.length === 0 && s1Population.length === 0;
  const s1 = step(1, 'Seed Hash Integrity',
    s1Ok ? 'PASS' : 'FAIL',
    s1Ok
      ? `${compared} of the ${EXPECTED_SEED_TRANSITIONS} rotation transitions required by src/loader.ts verified by SHA-256; `
        + `${phaseBoundarySkips} phase-boundary transitions excluded (end-of-phase rotation reveals the previous phase's seed); `
        + `0 seed rows without plaintext`
      : s1Population.length > 0
        ? `POPULATION MISMATCH vs src/loader.ts: ${s1Population.join('; ')}`
        : `${hashFailures.length} hash mismatches out of ${compared} comparisons`,
    {
      seedRecords: seeds.length, revealed, compared, phaseBoundarySkips, unrevealed,
      hashMismatches: hashFailures.length, populationIssues: s1Population,
      failures: hashFailures.slice(0, 10),
    },
  );

  // ── Step 2: Next-Seed Promotion + Forward Commitment Chain ──────────────────
  // Set membership proves a bet was served under SOME captured seed. It says nothing about
  // ORDER, and order is the property that matters: an operator free to choose which of the
  // committed seeds to activate next has a free hand. This capture carries the evidence for
  // order — a nextServerSeedHash on every seed row, and a promotion record whose
  // previousNextHash was already outstanding when the capture opened — and until this
  // release nothing read either. The step read the capture script's own `match` boolean,
  // which is the script marking its own homework.
  //
  // Three properties, all recomputed here from raw hex:
  //   (a) promotion: previousNextHash === newActiveHash at every rotation;
  //   (b) forward chain: seeds[i].nextServerSeedHash === seeds[i+1].serverSeedHashed;
  //   (c) pre-capture link: the first epoch's active hash was already committed as "next"
  //       before the first observation — an ABSENT link fails, it does not pass.
  const chainFailures: string[] = [];
  let promoChecked = 0, promoOk = 0;
  for (const s of seeds) {
    if (!s.nextSeedPromotion) {
      chainFailures.push(`${s.context}: no promotion record — rotation not observable`);
      continue;
    }
    promoChecked++;
    if (s.nextSeedPromotion.previousNextHash === s.nextSeedPromotion.newActiveHash) promoOk++;
    else chainFailures.push(
      `${s.context}: previousNextHash ${s.nextSeedPromotion.previousNextHash.substring(0, 16)}… ≠ newActiveHash ${s.nextSeedPromotion.newActiveHash.substring(0, 16)}…`,
    );
  }

  let linksChecked = 0, linksOk = 0;
  for (let i = 0; i < seeds.length - 1; i++) {
    linksChecked++;
    if (seeds[i].seed.nextServerSeedHash === seeds[i + 1].seed.serverSeedHashed) linksOk++;
    else chainFailures.push(
      `link ${i}→${i + 1}: seeds[${i}].nextServerSeedHash ≠ seeds[${i + 1}].serverSeedHashed — the records do not chain in one order`,
    );
  }

  const first = seeds[0];
  const preCaptureLink =
    first !== undefined
    && first.nextSeedPromotion !== undefined
    && first.nextSeedPromotion.previousNextHash === first.seed.serverSeedHashed;
  if (!preCaptureLink) {
    chainFailures.push(
      'pre-capture link absent: the first epoch\'s serverSeedHashed is not the hash that was outstanding as "next" before capture opened — the first epoch could have been chosen after observation began',
    );
  }

  const s2Population: string[] = [];
  if (promoChecked !== EXPECTED_SEEDS) s2Population.push(`promotion records ${promoChecked} != ${EXPECTED_SEEDS}`);
  if (linksChecked !== EXPECTED_SEED_TRANSITIONS) s2Population.push(`forward links ${linksChecked} != ${EXPECTED_SEED_TRANSITIONS}`);

  const s2Ok = chainFailures.length === 0 && s2Population.length === 0;
  const s2 = step(2, 'Next-Seed Promotion + Forward Commitment Chain',
    s2Ok ? 'PASS' : 'FAIL',
    s2Ok
      ? `${promoOk}/${EXPECTED_SEEDS} rotations recomputed from raw hex (previousNextHash === newActiveHash), `
        + `${linksOk}/${EXPECTED_SEED_TRANSITIONS} forward links verified (seeds[i].nextServerSeedHash === seeds[i+1].serverSeedHashed), `
        + `pre-capture link present — the records chain in one epoch order, not just one membership. These are consistency checks: `
        + `they do not date when a commitment was shown; that each was shown before its epoch's bets rests on the capture's `
        + `pre-bet observations (DL-4 in MANIFEST.md)`
      : s2Population.length > 0
        ? `POPULATION MISMATCH vs src/loader.ts: ${s2Population.join('; ')}`
        : `${chainFailures.length} commitment-chain breaks: ${chainFailures.slice(0, 3).join('; ')}`,
    {
      promotionsChecked: promoChecked, promotionsOk: promoOk,
      forwardLinksChecked: linksChecked, forwardLinksOk: linksOk,
      preCaptureLink, populationIssues: s2Population, failures: chainFailures.slice(0, 10),
    },
  );

  // ── Step 3: Hash consistency within epoch ────────────────────────────────────
  // THE EPOCH IS DERIVED FROM CAPTURE ORDER, NOT FROM THE HASH UNDER TEST. Grouping the bets by
  // `server_seed_hashed` (byHash) and then asking how many distinct hashes each group holds is an
  // identity: every group has exactly one, because that is what it was built on. So the old check
  // reported "all epochs consistent" for any dataset whatsoever — including one where the hash
  // changes in the middle of a round — and no mutation could make it fail.
  //
  // An epoch is instead the run of consecutive captured bets that starts when `nonce` returns to
  // 0. That delimiter comes from the nonce stream and the capture order, not from the field being
  // tested, so a hash swapped mid-epoch puts two hashes inside one run and FAILs here. The derived
  // run count must also equal the number of distinct hashes, or an epoch was split or merged
  // without either count noticing. (Ported from Plinko Step 3, 2026-09-22.)
  const s3Failures: string[] = [];
  const runs: DiceBet[][] = [];
  let currentRun: DiceBet[] = [];
  for (const b of bets) {
    if (b.response.nonce === 0 && currentRun.length) { runs.push(currentRun); currentRun = []; }
    currentRun.push(b);
  }
  if (currentRun.length) runs.push(currentRun);

  runs.forEach((runBets, i) => {
    const hashes = new Set(runBets.map(b => b.response.server_seed_hashed));
    if (hashes.size !== 1) {
      s3Failures.push(
        `Epoch ${i} (nonces ${runBets[0].response.nonce}–${runBets[runBets.length - 1].response.nonce}): `
        + `${hashes.size} distinct server_seed_hashed among ${runBets.length} bets`,
      );
    }
  });
  if (runs.length !== byHash.size) {
    s3Failures.push(
      `${runs.length} epochs in capture order but ${byHash.size} distinct server_seed_hashed values — `
      + `an epoch was split across commitments or two epochs share one`,
    );
  }

  const s3 = step(3, 'Hash Consistency Within Epoch',
    s3Failures.length === 0 ? 'PASS' : 'FAIL',
    s3Failures.length === 0
      ? `All ${runs.length} epochs, delimited by the nonce returning to 0 in capture order rather than by `
        + `the hash being tested: server_seed_hashed identical across every bet of each epoch, and `
        + `${runs.length} epochs to ${byHash.size} distinct commitments`
      : `${s3Failures.length} epochs have mid-epoch hash changes: ${s3Failures.slice(0, 3).join('; ')}`,
    { epochs: runs.length, distinctCommitments: byHash.size, failures: s3Failures.slice(0, 10) },
  );

  // ── Step 4: Nonce Audit (sequential continuity + capture-retry detection) ───
  const hardFailures: string[] = [];
  const captureArtifacts: string[] = [];
  const retroVerified: Array<{ epoch: string; missedNonce: number; computedResult: number }> = [];
  let epochsChecked = 0;
  let unverifiable = 0;

  for (const [hash, epochBets] of byHash) {
    const sorted = [...epochBets].sort((a, b) => a.response.nonce - b.response.nonce);
    const shortHash = hash.substring(0, 16);
    const nonces = sorted.map(b => b.response.nonce);

    const clientSeeds = new Set(sorted.map(b => b.response.client_seed));
    if (clientSeeds.size !== 1) {
      hardFailures.push(`Epoch ${shortHash}: ${clientSeeds.size} distinct client seeds`);
    }

    if (nonces[0] !== 0) {
      hardFailures.push(`Epoch ${shortHash}: first nonce is ${nonces[0]} (expected 0)`);
    }

    // A capture retry shows as the epoch's nonces running 0 … EXPECTED_EPOCH_SIZE with exactly one missing.
    const hasNonce50 = nonces.includes(EXPECTED_EPOCH_SIZE);
    const missingNonces = Array.from({ length: EXPECTED_EPOCH_SIZE + 1 }, (_, i) => i).filter(i => !nonces.includes(i));
    const isRetryPattern = hasNonce50 && missingNonces.length === 1 && nonces.length === EXPECTED_EPOCH_SIZE;

    if (isRetryPattern) {
      const missedNonce = missingNonces[0];
      const serverSeed = seedMap.get(hash);
      const clientSeedVal = sorted[0].response.client_seed;

      if (serverSeed) {
        const computedResult = computeResult(serverSeed, clientSeedVal, missedNonce);
        retroVerified.push({ epoch: shortHash, missedNonce, computedResult });
        captureArtifacts.push(
          `Epoch ${shortHash}: capture-retry — nonce ${missedNonce} missed; retroactively verified: result=${computedResult}`
        );
      } else {
        captureArtifacts.push(`Epoch ${shortHash}: capture-retry — nonce ${missedNonce}; server seed unrevealed`);
        unverifiable++;
      }
    } else {
      for (let i = 0; i < nonces.length; i++) {
        if (nonces[i] !== i) {
          hardFailures.push(`Epoch ${shortHash}: nonce[${i}]=${nonces[i]} (expected ${i})`);
          break;
        }
      }
    }

    epochsChecked++;
  }

  const allOk = hardFailures.length === 0;
  const hasCaptureArtifacts = captureArtifacts.length > 0;
  const allRetroVerified = hasCaptureArtifacts && unverifiable === 0;

  // A CAPTURE-RETRY GAP IS A FLAG, NOT A PASS (DICE-04, profile 1.0.2). An operator-side gap or
  // repeat within an epoch is a HARD FAIL. A gap the capture missed live but that the commit-reveal
  // chain reconstructs — the revealed server seed is in seedMap only after its SHA-256 matched the
  // published commitment, so the outcome is crypto-determined — is disclosed as a capture-origin
  // FLAG: counted, given a limitation row (DL-1 in MANIFEST.md), and verdict-neutral. It is NOT a
  // PASS (the auditor did not witness the roll live) and it does NOT downgrade the verdict (the
  // roll follows from a revealed seed consistent with the commitment the capture recorded before
  // the epoch's first bet; that timing rests on the capture record, DL-4). Only an UNVERIFIABLE
  // gap — no revealed seed, or a
  // seed that does not hash to the commitment — is a verdict-affecting FLAG.
  const s4Status: 'PASS' | 'FLAG' | 'FAIL' =
    !allOk ? 'FAIL'
    : hasCaptureArtifacts ? 'FLAG'
    : 'PASS';
  const s4Origin: 'capture' | 'operator' | undefined =
    s4Status === 'FLAG' && allRetroVerified ? 'capture' : undefined;

  const s4Detail = !allOk
    ? `${hardFailures.length} nonce violations: ${hardFailures.slice(0, 3).join('; ')}`
    : allRetroVerified
      ? `${epochsChecked} epochs: nonces otherwise sequential 0–49, single client seed per epoch. `
        + `${captureArtifacts.length} capture-retry epoch(s): the live capture missed exactly one nonce (nonce 50 present, one of 0–49 absent) `
        + `and each was reconstructed from a revealed server seed whose SHA-256 matches the commitment the capture recorded before that `
        + `epoch's first bet (hash equality is a consistency check; the timing rests on that capture record, DL-4). The commit-reveal chain `
        + `determines the outcome, but the auditor did not witness it live, so this is disclosed as a capture-origin FLAG (limitation DL-1 in `
        + `MANIFEST.md), not a PASS. Capture-origin: verdict-neutral — the verdict stays Full Pass. ${unverifiable} unverifiable.`
      : hasCaptureArtifacts
        ? `${epochsChecked} epochs. ${captureArtifacts.length} capture-retry: ${retroVerified.length} verified via commit-reveal, `
          + `${unverifiable} NOT verifiable (no revealed seed or the seed does not hash to the commitment) — the unverifiable one(s) carry this flag.`
        : `${epochsChecked} epochs: nonces sequential 0–49, single client seed per epoch.`;

  const s4 = step(4, 'Nonce Audit', s4Status, s4Detail,
    {
      epochsChecked,
      captureRetryEpochs: captureArtifacts.length,
      reconstructedViaCommitReveal: retroVerified.length,
      unverifiable,
      reconstructed: retroVerified,
    },
    s4Origin);

  return [s1, s2, s3, s4];
}
