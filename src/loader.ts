import * as fs     from 'fs';
import * as path   from 'path';
import * as crypto from 'crypto';
import type { DiceDataset, DiceBet, SeedEntry } from './types';
import { theoreticalMultiplier } from './rng';

const DATASET_PATH  = path.join(__dirname, '../data/dice-master-6700bets.json');
const EXPECTED_HASH = '3550ffca07a6f7825f96cdd4e3d8c3cd57898b5b5238b9739753a754cff056d6';

// ── POPULATION OF RECORD ──────────────────────────────────────────────────────
// The capture plan stated as CODE, next to the dataset pin, so the scored steps have
// something to check the data against that the data does not control. A dataset that
// agrees with its own header proves nothing: delete bets, delete seeds, shrink every
// epoch and edit the header to match, and the file is still internally consistent —
// and it re-pins cleanly, because re-pinning is what a forger does. Anything scored
// against these numbers has to HARD_FAIL when they disagree.
export const EXPECTED_BETS  = 6700;
export const EXPECTED_SEEDS = 138;
export const EXPECTED_PHASE_BETS: Readonly<Record<string, number>> =
  Object.freeze({ A: 5000, B: 1000, C: 200, D: 500 });
export const EXPECTED_SEED_PHASES: Readonly<Record<string, number>> =
  Object.freeze({ A: 101, B: 21, C: 5, D: 11 });

// EXPECTED_REVEALED_SEEDS counts seed ROWS that carry a plaintext field: every one of the 138 does,
// row 0 only because its plaintext (epoch 0's own seed) was copied from row 1 outside the capture
// script, which writes the first rotation with serverSeed null (MANIFEST.md#dataset-and-capture);
// no step hashes row 0's plaintext or replays a bet with it. For i ≥ 1, row i's
// plaintext reveals row i-1's commitment, so the rows reveal 134 commitments, one for every
// epoch with bets. The 4 rotations with no bets (seed rows 100, 121, 126, 137: three end-of-phase
// rotations and the final one) are never revealed. Of the 137 adjacent transitions, 3 cross a
// phase boundary, where the phase-start row repeats the previous phase's last revealed seed
// instead of revealing the end-of-phase rotation's, so 134 transitions are compared.
export const EXPECTED_REVEALED_SEEDS       = 138;
export const EXPECTED_SEED_TRANSITIONS     = 137;
export const EXPECTED_PHASE_BOUNDARY_SKIPS = 3;

// Every epoch in this capture is a full 50 bets; there are 134 of them. Asserting the
// SIZE alone leaves epoch count free, so dropping whole epochs passes — both are pinned.
export const EXPECTED_EPOCHS     = 134;
export const EXPECTED_EPOCH_SIZE = 50;

// Target is the configuration dimension, valid over 2…9998: the duel.com dice config (E14,
// scaling_edge) defines an edge only for 2…9998 winning outcomes, and src/rng.ts (rebuilt from
// docs/ALGORITHM.md §3.3) refuses a multiplier outside those bands. Until v1.2.0 this read 1…9999,
// which disagreed with the RTP claim table's 2–9998 (src/rtp-settings.ts). Phase A samples it at random,
// so the coverage question is whether the sampling actually spanned the range: the target
// space is split into ten 1000-wide bands and each must carry the floor below. The lowest
// band observed carries 404 bets (403 under the former 1…9999 bands), so a floor of 350 fails on a band cut to a token sample
// while leaving the honest capture passing.
export const TARGET_MIN = 2;
export const TARGET_MAX = 9998;
export const TARGET_BANDS = 10;
export const MIN_BETS_PER_TARGET_BAND = 350;

// ── DECLARED STAKE LEVELS & DIRECTION MODES (DICE-15 coverage) ─────────────────
// The capture plan exercises two stake levels: a $0.01 base stake (Phases A, B, D) and a $10
// elevated stake (Phase C, 1,000× the base) so that the payout path is exercised at size, not
// only the roll. Both levels must appear in the capture — a capture that dropped the elevated level
// leaves bet-size invariance untested — so each declared level carries a floor below, pinned here
// in code rather than described in prose. The constant names keep "TIER"; these are not Duel's
// edge tiers, and both levels are in its 0.1 % edge tier (MANIFEST.md#scaling-edge, DL-15).
export const EXPECTED_STAKE_TIERS: readonly number[] = Object.freeze([0.01, 10]);
export const MIN_BETS_PER_STAKE_TIER = 100;
// Duel Dice offers two direction modes, "over" (win iff result > target) and "under" (a settled
// roll-under bet is shown in evidence/E10-bet-history.png). This capture and this verifier cover
// "over" only: the capture holds 0 under bets, and Step 8's win rule, Step 13's lattice
// enumeration and the multiplier formula are written for the over rule alone, so an "under" bet
// settled by the over rule would be scored wrong. DECLARED_DIRECTION_MODES is therefore the
// AUDITED mode set, not the set of modes the game offers. It is asserted against the capture's
// bet_type field in Step 18, so a mode the verifier is not written for cannot enter the dataset
// unnoticed. Roll-under is a declared limitation (DL-14 in MANIFEST.md).
export const DECLARED_DIRECTION_MODES: readonly string[] = Object.freeze(['over']);

// ── DECLARED ODDS BOUNDS (DICE-14) ────────────────────────────────────────────
// The multiplier is 0.999 / ((10000 − target) / 10001), a strictly INCREASING function of the
// target: a higher target means a lower win chance and a larger payout. So the two edges of the
// valid over-bet target band [TARGET_MIN, TARGET_MAX] give the declared min/max odds. A quoted
// multiplier outside [MIN_ODDS, MAX_ODDS] would mean a target outside the game's valid domain —
// disclosed as a FLAG (DICE-14 is FLAG policy). Derived here from the src constants above and the
// formula in src/rng.ts, never from the dataset, so the bound describes the game rather than the
// capture. MIN_ODDS = 0.999·10001/9998 ≈ 0.99930; MAX_ODDS = 0.999·10001/2 = 4995.4995.
export const MIN_ODDS = theoreticalMultiplier(TARGET_MIN);
export const MAX_ODDS = theoreticalMultiplier(TARGET_MAX);

export function getDatasetPath(): string { return DATASET_PATH; }

export function loadDataset(): DiceDataset {
  const raw = fs.readFileSync(DATASET_PATH, 'utf-8');
  return JSON.parse(raw) as DiceDataset;
}

export function loadDatasetBuffer(): Buffer {
  return fs.readFileSync(DATASET_PATH);
}

export function checkDatasetHash(): { expected: string; actual: string; match: boolean } {
  const raw    = fs.readFileSync(DATASET_PATH);
  const actual = crypto.createHash('sha256').update(raw).digest('hex');
  return { expected: EXPECTED_HASH, actual, match: actual === EXPECTED_HASH };
}

/**
 * Build O(1) map: serverSeedHashed → serverSeed (plaintext).
 *
 * In the v3 dataset, seeds[N].seed.serverSeed is the PREVIOUS epoch's
 * revealed seed. The plaintext for seeds[N].serverSeedHashed is in
 * seeds[N+1].seed.serverSeed. We verify the hash before adding. seeds[0]'s own
 * plaintext was copied from seeds[1] outside the capture script and is not read here.
 */
export function buildSeedMap(seeds: SeedEntry[]): Map<string, string> {
  const m = new Map<string, string>();
  for (let i = 0; i < seeds.length - 1; i++) {
    const next = seeds[i + 1];
    if (next.seed.serverSeed) {
      const h = crypto.createHash('sha256')
        .update(Buffer.from(next.seed.serverSeed, 'hex'))
        .digest('hex');
      if (h === seeds[i].seed.serverSeedHashed) {
        m.set(seeds[i].seed.serverSeedHashed, next.seed.serverSeed);
      }
    }
  }
  return m;
}

/** Group bets by serverSeedHashed (epoch). */
export function groupByHash(bets: DiceBet[]): Map<string, DiceBet[]> {
  const m = new Map<string, DiceBet[]>();
  for (const b of bets) {
    const hash = b.response.server_seed_hashed;
    const arr = m.get(hash) ?? [];
    arr.push(b);
    m.set(hash, arr);
  }
  return m;
}

/** Compute the "over" win condition deterministically from bet data. */
export function isWin(bet: DiceBet): boolean {
  return bet.response.result > bet.request.target;
}
