/**
 * Duel.com Dice — RNG implementation.
 *
 * Source: duel.com/fairness/verify (game selector → Dice)
 *
 * Algorithm: HMAC-SHA256 with rejection sampling.
 *   key     = hex_decode(serverSeed)   ← hex bytes, NOT UTF-8 string
 *   message = clientSeed + ":" + nonce
 *   hash    = HMAC-SHA256(key, message)
 *
 * Rejection sampling (modulo bias prevention):
 *   RANGE    = 10001
 *   MAX_U32  = 0xFFFFFFFF
 *   MAX_FAIR = MAX_U32 − (MAX_U32 % RANGE)
 *   scan 4-byte (8 hex-char) chunks of hash left-to-right:
 *     if chunk < MAX_FAIR → result = chunk % RANGE   (0–10000)
 *
 * Win condition (over bet): result > target
 * Win chance:  (10000 − target) / 10001
 * Multiplier:  0.999 / win_chance
 */

import * as crypto from 'crypto';

export const RANGE    = 10001;
const MAX_U32  = 0xFFFFFFFF;
export const MAX_FAIR = MAX_U32 - (MAX_U32 % RANGE);

/**
 * Compute the dice result (0–10000) from revealed seed components.
 * Key must be the hex-decoded server seed buffer.
 */
export function computeResultFromBuffer(
  keyBuffer: Buffer,
  clientSeed: string,
  nonce: number,
): number {
  const message = `${clientSeed}:${nonce}`;
  const hash    = crypto.createHmac('sha256', keyBuffer).update(message).digest('hex');

  for (let off = 0; off + 8 <= hash.length; off += 8) {
    const value = parseInt(hash.substring(off, off + 8), 16);
    if (value < MAX_FAIR) {
      return value % RANGE;  // 0–10000 integer
    }
  }
  // Probability ~1.24×10⁻⁴⁶ — practically unreachable
  throw new Error(`RNG hash exhausted for nonce=${nonce}`);
}

export function computeResult(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
): number {
  const key = Buffer.from(serverSeed, 'hex');
  return computeResultFromBuffer(key, clientSeed, nonce);
}

/** SHA-256 commit-reveal: verify SHA-256(hex_bytes(serverSeed)) === serverSeedHashed */
export function verifyHash(serverSeed: string, serverSeedHashed: string): boolean {
  const seedBytes = Buffer.from(serverSeed, 'hex');
  const computed  = crypto.createHash('sha256').update(seedBytes).digest('hex');
  return computed === serverSeedHashed;
}

/** Theoretical win chance for an "over" bet at the given target (0–9999). */
export function theoreticalWinChance(target: number): number {
  return (10000 - target) / RANGE;
}

/** Theoretical multiplier for a win at the given target. */
export function theoreticalMultiplier(target: number): number {
  return 0.999 / theoreticalWinChance(target);
}
