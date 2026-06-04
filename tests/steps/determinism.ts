/**
 * Steps 5–6: RNG Determinism
 */

import type { StepResult } from './context';
import { step, VerifyContext } from './context';
import { computeResultFromBuffer, computeResult } from '../../src/rng';

export function run(ctx: VerifyContext): StepResult[] {
  const { bets, seedMap } = ctx;

  // ── Step 5: Result recomputation ─────────────────────────────────────────────
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
  const s5 = step(5, 'Result Recomputation (RNG determinism)',
    mismatches === 0 ? 'PASS' : 'FAIL',
    `${bets.length - skipped}/${bets.length} verified, ${mismatches} mismatches, ${skipped} skipped`,
  );

  // ── Step 6: Client seed influence ─────────────────────────────────────────────
  const WRONG_CLIENT = 'wrong-client-seed-test';
  let tested  = 0;
  let changed = 0;
  // Sample ~5 bets per epoch
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
    for (const b of epochBets.slice(0, 5)) {
      tested++;
      const correct = computeResultFromBuffer(key, b.response.client_seed, b.response.nonce);
      const wrong   = computeResultFromBuffer(key, WRONG_CLIENT, b.response.nonce);
      if (correct !== wrong) changed++;
    }
  }
  const s6 = step(6, 'Client Seed Influence',
    changed === tested ? 'PASS' : changed / tested > 0.95 ? 'PASS' : 'FAIL',
    `${changed}/${tested} bets: wrong clientSeed → different result`,
  );

  return [s5, s6];
}
