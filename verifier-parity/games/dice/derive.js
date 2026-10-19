import { hmacSha256Hex, hexToBytes } from '../../lib/hmac-sha256';

/**
 * Dice RNG — port of Duel's HMAC-SHA256 + rejection sampling algorithm.
 *
 * Source of truth (audit repo):
 *   https://github.com/ProvablyFair-org/duel-dice/blob/main/src/rng.ts
 *
 * Algorithm:
 *
 *   key     = hex-decoded serverSeed (raw bytes, NOT utf-8)
 *   message = `${clientSeed}:${nonce}`
 *   hash    = HMAC-SHA256(key, message).hex()        // 64 hex chars = 8 chunks
 *
 *   RANGE    = 10001
 *   MAX_U32  = 0xFFFFFFFF
 *   MAX_FAIR = MAX_U32 − (MAX_U32 % RANGE)
 *
 *   for off = 0, 8, 16, ... step 8:
 *     chunk = parseInt(hash[off..off+8], 16)
 *     if chunk < MAX_FAIR:
 *       return chunk % RANGE                         // integer 0..10000
 *
 * Win condition:
 *   over:  result > target           (target = UI value × 100, e.g. 50.05 → 5005)
 *   under: result < target           (target = UI value × 100, e.g. 49.95 → 4995)
 *
 *   In Duel's UI, over and under use independent target values — a 50/50 bet
 *   is "over 50.05" OR "under 49.95", giving the same 49.95% win chance.
 *
 * Win chance:
 *   over:  (10000 − target) / 10001
 *   under: target / 10001
 *
 * Multiplier (both):
 *   0.999 / win_chance               // 0.1% house edge
 *
 * Verified against all 6,700 captured "over" bets in the audit dataset — 100%
 * parity. Under semantics confirmed against Duel's live UI (see screenshots
 * archived in PR #N): over 50.05 and under 49.95 both display 49.95% win chance
 * and 2.0000× multiplier, matching the symmetric formulas above.
 */

const RANGE = 10001;
const MAX_U32 = 0xffffffff;
const MAX_FAIR = MAX_U32 - (MAX_U32 % RANGE);

/**
 * Derive the full Dice outcome for a single bet.
 *
 * @param {Object} params
 * @param {string} params.clientSeed   — player-controlled seed string
 * @param {string} params.serverSeed   — server seed (hex post-reveal, or any
 *                                        string for testing — see seedKey())
 * @param {number} params.nonce        — bet sequence number within seed epoch
 * @param {number} params.target       — internal target 0..9999 (UI = target/100)
 * @param {'over'|'under'} params.betType
 */
export function deriveDice({ clientSeed, serverSeed, nonce, target, betType = 'over' }) {
  const key = seedKey(serverSeed);
  const message = `${clientSeed}:${nonce}`;
  const hash = hmacSha256Hex(key, message);

  let result = -1;
  let firstChunkUsed = -1;
  let firstChunkHex = '';
  for (let off = 0; off + 8 <= hash.length; off += 8) {
    const chunkHex = hash.substring(off, off + 8);
    const value = parseInt(chunkHex, 16);
    if (value < MAX_FAIR) {
      result = value % RANGE;
      firstChunkUsed = off / 8;
      firstChunkHex = chunkHex;
      break;
    }
  }
  if (result === -1) {
    throw new Error(`RNG hash exhausted for nonce=${nonce} (probability ~1e-46)`);
  }

  const isWin = betType === 'under' ? result < target : result > target;
  const winChance = betType === 'under'
    ? target / RANGE
    : (10000 - target) / RANGE;
  const multiplier = isWin && winChance > 0 ? 0.999 / winChance : 0;

  return {
    result,
    resultDisplay: (result / 100).toFixed(2),
    isWin,
    winChance,
    multiplier,
    targetDisplay: (target / 100).toFixed(2),
    betType,
    firstChunkUsed,
    firstChunkHex,
    hash,
  };
}

/**
 * Convert a server seed string into the HMAC key bytes.
 *
 * Duel's production seeds are 64-char hex (32-byte server seed). For those, we
 * use the hex-decoded bytes — this is what produces casino-matching results.
 *
 * For non-hex inputs (testing the verifier with strings like "abc123" before
 * you have real seeds), we fall back to UTF-8 encoding so the tool still
 * produces stable deterministic output. The shell shows a soft warning when
 * the seed isn't 64-char hex so users know the result won't match a real bet.
 */
function seedKey(serverSeed) {
  if (isHex(serverSeed)) return hexToBytes(serverSeed);
  return utf8Bytes(serverSeed);
}

function isHex(s) {
  return typeof s === 'string' && s.length > 0 && s.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(s);
}

function utf8Bytes(s) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
  const out = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  return new Uint8Array(out);
}

/** Theoretical win chance for a (target, betType). Used by the Viz. */
export function diceWinChance(target, betType = 'over') {
  return betType === 'under' ? target / RANGE : (10000 - target) / RANGE;
}

/** Theoretical multiplier. Returns Infinity at boundaries with 0 win chance. */
export function diceMultiplier(target, betType = 'over') {
  const wc = diceWinChance(target, betType);
  return wc > 0 ? 0.999 / wc : Infinity;
}

export const DICE_TARGET_MIN = 1;     // UI 0.01
export const DICE_TARGET_MAX = 9998;  // UI 99.98
