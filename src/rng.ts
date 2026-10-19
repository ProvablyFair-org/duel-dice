/**
 * Duel.com Dice — RNG implementation.
 *
 * PORTED FROM THE OPERATOR'S OWN SOURCE: the Dice code panel of duel.com → Provably Fair → Verify
 * (Expand → Copy), copied verbatim by the auditor on 2026-09-25 to
 * evidence/verify-tab/duel-verify-tab-dice-2026-09-25.js (SHA-256 38b257c6…950a5b, pinned in
 * src/operator-verifier.ts). "Lxx" is a line of that file. Every citation is listed in
 * OPERATOR_SOURCE_CITES and checked against the pinned bytes by Step 5 and the unit tests — a cited
 * line that does not carry the quoted text FAILs. Step 5 also EXECUTES that file on every captured
 * bet and requires its roll (a display string, value % RANGE / 100) to equal this module's on the
 * integer lattice. (Corrected 2026-09-25: this header used to cite only duel.com/fairness/verify.)
 * The win rule and the multiplier below are NOT in the operator file — it computes the roll only.
 *
 * Algorithm: HMAC-SHA256 with rejection sampling.
 *   key     = hex_decode(serverSeed)   ← hex bytes, NOT UTF-8 string        L28, L34
 *   message = clientSeed + ":" + nonce                                     L53
 *   hash    = HMAC-SHA256(key, message)                                    L56
 *
 * Rejection sampling (modulo bias prevention):
 *   RANGE    = 10001                                                       L45
 *   MAX_U32  = 0xFFFFFFFF                                                  L44
 *   MAX_FAIR = MAX_U32 − (MAX_U32 % RANGE)                                 L48
 *   scan 4-byte (8 hex-char) chunks of hash left-to-right:                 L60, L62, L70
 *     if chunk < MAX_FAIR → result = chunk % RANGE   (0–10000)            L65, L66 (the file divides by 100 to display)
 *   every chunk rejected → throw                                           L74
 *
 * Win condition (over bet): result > target
 * Win chance:  (10000 − target) / 10001
 * Multiplier:  0.999 / win_chance
 */

import * as crypto from 'crypto';

// ── Operator source citations (checked, not decorative) ────────────────────
/**
 * Each entry: a line of evidence/verify-tab/duel-verify-tab-dice-2026-09-25.js and text that line
 * must contain verbatim. src/operator-verifier.ts checkOperatorCites reads the pinned file and FAILs
 * any entry whose line does not carry its text.
 */
export const OPERATOR_SOURCE_CITES: ReadonlyArray<{ line: number; text: string; ports: string }> = Object.freeze([
  { line: 28, text: 'const keyBytes = hexToBytes(keyHex);', ports: 'the server seed is hex-decoded to the HMAC key' },
  { line: 34, text: "{ name: 'HMAC', hash: 'SHA-256' },", ports: 'HMAC-SHA256' },
  { line: 44, text: 'const MAX_UINT32 = 0xffffffff;', ports: 'MAX_U32' },
  { line: 45, text: 'const RANGE = 10001; // 0-10000 inclusive', ports: 'RANGE' },
  { line: 48, text: 'const MAX_FAIR = MAX_UINT32 - (MAX_UINT32 % RANGE);', ports: 'MAX_FAIR' },
  { line: 53, text: 'new TextEncoder().encode(`${clientSeed}:${nonce}`)', ports: 'the HMAC message (no cursor)' },
  { line: 60, text: 'while (offset + 8 <= hash.length) {', ports: 'eight 4-byte chunks, first to last' },
  { line: 62, text: 'const value = parseInt(hash.slice(offset, offset + 8), 16);', ports: 'chunk read as a big-endian uint32 (8 hex chars)' },
  { line: 65, text: 'if (value < MAX_FAIR) {', ports: 'accept below MAX_FAIR' },
  { line: 66, text: 'return ((value % RANGE) / 100).toString();', ports: 'roll = value mod RANGE (the file displays it / 100)' },
  { line: 70, text: 'offset += 8;', ports: 'next chunk on rejection' },
  { line: 74, text: "throw new Error('Failed to generate unbiased dice value from hash');", ports: 'every chunk rejected → throw' },
]);

export const RANGE    = 10001;                          // operator L45
export const MAX_U32  = 0xFFFFFFFF;                     // operator L44
export const MAX_FAIR = MAX_U32 - (MAX_U32 % RANGE);   // operator L48

/**
 * THE DRAW BIAS BOUND, COMPUTED FROM THE SAME NUMBERS THE DRAW USES.
 *
 * `computeResultFromBuffer` scans 32-bit chunks and accepts the first `value < MAX_FAIR`,
 * returning `value % RANGE`. Whether that draw is uniform on 0..RANGE-1 is decided before any
 * live roll: the accepted window [0, MAX_FAIR) must hold a WHOLE number of ranges, or the low
 * residues are over-represented and no amount of captured data corrects it. This function
 * recomputes the bound from `RANGE`, `MAX_U32` and `MAX_FAIR` — the same three constants the
 * draw reads — so the number a step prints describes the code that produced the rolls, not a
 * claim typed beside it.
 *
 * Because `MAX_FAIR = MAX_U32 − (MAX_U32 % RANGE)` is by construction a multiple of RANGE, the
 * accepted window divides exactly: every residue 0..RANGE-1 is produced by exactly
 * `MAX_FAIR / RANGE` of the accepted 32-bit values, so its conditional probability given
 * acceptance is exactly 1/RANGE and the worst-case bias is 0 — well inside the profile's 2^-32
 * ceiling. The rejection census (how many of the 2^32 chunk values fall in the discarded tail
 * [MAX_FAIR, 2^32)) is returned too, since the profile asks for it when rejection sampling is
 * the mechanism.
 *
 * Returned as numbers, never as a sentence: the profile's floor is 2^-32 and a reader has to be
 * able to compare the two.
 */
export function drawBiasBound(): {
  algorithm: 'rejection-sampling';
  range: number;
  maxU32: number;
  maxFair: number;
  rangesAccepted: number;
  wholeNumberOfRanges: boolean;
  domainSize: number;
  remainder: number;
  minResidueCount: number;
  maxResidueCount: number;
  bias: number;
  exact: boolean;
  rejectionSampling: boolean;
  rejectedDrawsPerChunk: number;
  rejectionProbabilityPerChunk: number;
} {
  // The chunk value is parseInt of 8 hex chars → an integer in [0, 2^32 − 1], i.e. 2^32 values.
  const domainSize = MAX_U32 + 1;                 // 2^32 possible chunk values
  const rangesAccepted = MAX_FAIR / RANGE;        // whole number by construction
  const remainder = MAX_FAIR % RANGE;             // 0 ⇒ the window holds a whole number of ranges
  // Residue counts across the ACCEPTED window [0, MAX_FAIR): a value v is accepted iff v < MAX_FAIR,
  // and each residue r is produced by floor((MAX_FAIR − 1 − r) / RANGE) + 1 accepted values.
  const minResidueCount = Math.floor(MAX_FAIR / RANGE);
  const maxResidueCount = remainder === 0 ? minResidueCount : minResidueCount + 1;
  // Bias = the largest gap between any residue's share of the accepted window and the ideal 1/RANGE.
  const bias = Math.max(
    maxResidueCount / MAX_FAIR - 1 / RANGE,
    1 / RANGE - minResidueCount / MAX_FAIR,
  );
  const rejectedDrawsPerChunk = domainSize - MAX_FAIR;  // values in the discarded tail [MAX_FAIR, 2^32)
  return {
    algorithm: 'rejection-sampling',
    range: RANGE,
    maxU32: MAX_U32,
    maxFair: MAX_FAIR,
    rangesAccepted,
    wholeNumberOfRanges: remainder === 0,
    domainSize,
    remainder,
    minResidueCount,
    maxResidueCount,
    bias,
    exact: remainder === 0,
    rejectionSampling: true,
    rejectedDrawsPerChunk,
    rejectionProbabilityPerChunk: rejectedDrawsPerChunk / domainSize,
  };
}

/**
 * Compute the dice result (0–10000) from revealed seed components.
 * Key must be the hex-decoded server seed buffer.
 */
export function computeResultFromBuffer(
  keyBuffer: Buffer,
  clientSeed: string,
  nonce: number,
): number {
  const message = `${clientSeed}:${nonce}`;                                         // operator L53
  const hash    = crypto.createHmac('sha256', keyBuffer).update(message).digest('hex');  // operator L27–L42, L56

  for (let off = 0; off + 8 <= hash.length; off += 8) {         // operator L60, L70
    const value = parseInt(hash.substring(off, off + 8), 16);   // operator L62
    if (value < MAX_FAIR) {                                     // operator L65
      return value % RANGE;  // 0–10000 integer                    operator L66 (without the display / 100)
    }
  }                                                             // all rejected → operator L74 throws
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

// ── EXACT ARITHMETIC ON THE SERVED 1e-18 GRID ───────────────────────────────────
// Duel serves `multiplier`, `amount_currency` and `amount_won` as decimal strings with at most 18
// fractional digits. Parsing them to a double and comparing at a tolerance throws away the one
// property that makes an exact check possible: every served figure is an integer count of 1e-18
// units. The helpers below keep it that way — BigInt end to end, no float anywhere — so a served
// figure one grid unit (1e-18) off its declared rule is a mismatch, not noise.
//
// The declared formula is multiplier = 0.999 / ((10000 − target) / RANGE), i.e. the exact rational
//   EDGE_NUM · RANGE / (EDGE_DEN · (10000 − target)),   EDGE_NUM / EDGE_DEN = 999 / 1000 = 0.999
// and the declared rounding onto the grid is to the NEAREST unit. (The capture holds no exact tie,
// so the direction a tie would round is unwitnessed; the helpers count ties so a step can say so.)

/** The declared edge factor 0.999 as an exact ratio (published fairness page). */
export const EDGE_NUM = 999n;
export const EDGE_DEN = 1000n;
/** Fractional digits of every served money / multiplier string. */
export const GRID_DP = 18;
/** One unit of the served grid is 1 / GRID. */
export const GRID = 10n ** BigInt(GRID_DP);

/**
 * A served decimal string → integer units of 1e-18, or null when it is not a plain non-negative
 * decimal with at most 18 fractional digits (a value off the grid cannot be compared on it).
 */
export function parseGridUnits(s: unknown): bigint | null {
  if (typeof s !== 'string' || !/^\d+(\.\d{1,18})?$/.test(s)) return null;
  const [i, f = ''] = s.split('.');
  return BigInt(i) * GRID + BigInt((f + '0'.repeat(GRID_DP)).slice(0, GRID_DP));
}

/** num / den rounded to the nearest integer (ties up); `tie` reports an exact half. */
export function roundNearest(num: bigint, den: bigint): { q: bigint; tie: boolean } {
  const q = num / den, r = num % den;
  return { q: 2n * r >= den ? q + 1n : q, tie: 2n * r === den };
}

/** The declared multiplier at `target`, rounded to the nearest 1e-18 unit. */
export function exactMultiplierUnits(target: number): { units: bigint; tie: boolean } {
  const r = roundNearest(EDGE_NUM * BigInt(RANGE) * GRID, EDGE_DEN * BigInt(10000 - target));
  return { units: r.q, tie: r.tie };
}

/**
 * The declared settlement of a win: stake × the EXACT formula multiplier (not the rounded served
 * string), rounded to the nearest 1e-18 unit. Measured on the capture before it was adopted:
 * rounding stake × the served multiplier instead disagrees by one unit wherever that product ends
 * in an exact half, and a half-down rule on it fails elsewhere; this rule is the one that fits
 * every win.
 */
export function exactPayoutUnits(amountUnits: bigint, target: number): { units: bigint; tie: boolean } {
  const r = roundNearest(amountUnits * EDGE_NUM * BigInt(RANGE), EDGE_DEN * BigInt(10000 - target));
  return { units: r.q, tie: r.tie };
}
