import * as fs     from 'fs';
import * as path   from 'path';
import * as crypto from 'crypto';
import type { DiceDataset, DiceBet, SeedEntry } from './types';

const DATASET_PATH  = path.join(__dirname, '../data/dice-master-6700bets.json');
const EXPECTED_HASH = '3550ffca07a6f7825f96cdd4e3d8c3cd57898b5b5238b9739753a754cff056d6';

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
 * seeds[N+1].seed.serverSeed. We verify the hash before adding.
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
