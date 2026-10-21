/**
 * PROVENANCE (header added on integration, 20 Oct 2026; everything below this comment is the
 * clean-room module byte for byte).
 *
 * This module was REBUILT FROM A WRITTEN SPECIFICATION, not ported from Duel's code:
 *   spec      docs/ALGORITHM.md, a copy of games/dice/ALGORITHM.md in the ProvablyFair.org audit
 *             framework (pf-audit, branch clean-room-spec-2026-10-20, commit cc279ef). Written from
 *             Duel's public pages, the standard provably-fair construction and the 6,700 live bets,
 *             without opening Duel's code (its §8 lists every file read).
 *   rebuild   written by an implementer who read ONLY that spec and a module-interface file, and
 *             never opened Duel's code, its Verify-tab file, or this package's earlier src/rng.ts.
 *   self-test tests/dice/RngSpecTests.ts (the spec's §5 vectors and properties).
 *
 * Duel's published Verify-tab code (evidence/verify-tab/duel-verify-tab-dice-2026-09-25.js, E13) is
 * NOT the source of this module. It is run byte for byte as a SECOND CHECK, by Step 5 and the unit
 * tests (src/operator-verifier.ts), next to the ProvablyFair.org docs-site and live-site verifiers.
 *
 * Three-way agreement measured on integration (20 Oct 2026, the 6,700-bet capture): this module vs
 * the live bets, roll / commitment / win flag 6,700/6,700 and payout 2,519/2,519 wins; vs Duel's
 * Verify-tab code 6,700/6,700 rolls; vs the provablyfair.org live verifier 6,700/6,700 rolls.
 * Step 5 of `npm run verify` re-measures all three on every run.
 */
// Duel.com Dice: outcome derivation and settlement, written from ALGORITHM.md only.
// Node `crypto` only, no other dependencies. Section numbers (§) refer to ALGORITHM.md.

import { createHash, createHmac } from 'crypto';

// ---------------------------------------------------------------------------
// Constants (§2 Step 2)
// ---------------------------------------------------------------------------

/** Number of distinct roll outcomes: the lattice 0, 1, ..., 10000 (§2 Step 2, N = 10001). */
export const RANGE: number = 10001;

/** Largest unsigned 32-bit value, 2^32 - 1. */
export const MAX_U32: number = 0xffffffff;

/**
 * Rejection limit (§2 Step 2, LIMIT = floor(2^32 / N) * N = 4294959453).
 * A 4-byte chunk whose value is >= this is discarded so that every residue
 * mod RANGE is equally likely.
 */
export const MAX_FAIR: number = Math.floor((MAX_U32 + 1) / RANGE) * RANGE;

// ---------------------------------------------------------------------------
// Analytic bias report (§2 Step 2, rejection sampling)
// ---------------------------------------------------------------------------

export function drawBiasBound(): {
  algorithm: 'rejection-sampling';
  range: number; maxU32: number; maxFair: number;
  rangesAccepted: number;
  wholeNumberOfRanges: boolean;
  domainSize: number;
  remainder: number;
  minResidueCount: number; maxResidueCount: number;
  bias: number;
  exact: boolean;
  rejectionSampling: boolean;
  rejectedDrawsPerChunk: number;
  rejectionProbabilityPerChunk: number;
} {
  // Work in BigInt so nothing here depends on float rounding.
  const range = BigInt(RANGE);
  const maxFair = BigInt(MAX_FAIR);
  const domain = BigInt(MAX_U32) + 1n; // 2^32 distinct chunk values

  // Accepted values are 0 .. MAX_FAIR-1. Residue r mod RANGE occurs
  // floor(MAX_FAIR/RANGE) times, plus one more for r < MAX_FAIR mod RANGE.
  const whole = maxFair / range;
  const extra = maxFair % range;
  const minCount = whole;
  const maxCount = extra === 0n ? whole : whole + 1n;

  // Worst-case |count/MAX_FAIR - 1/RANGE| = |count*RANGE - MAX_FAIR| / (MAX_FAIR*RANGE).
  // The numerator is an integer, so "exactly zero" is decided without floats.
  const devMax = maxCount * range - maxFair;
  const devMin = maxFair - minCount * range;
  const worstNum = devMax > devMin ? devMax : devMin;
  const bias = Number(worstNum) / (Number(maxFair) * Number(range));

  const rejected = domain - maxFair;

  return {
    algorithm: 'rejection-sampling',
    range: RANGE,
    maxU32: MAX_U32,
    maxFair: MAX_FAIR,
    rangesAccepted: MAX_FAIR / RANGE,
    wholeNumberOfRanges: extra === 0n,
    domainSize: Number(domain),
    remainder: Number(rejected),
    minResidueCount: Number(minCount),
    maxResidueCount: Number(maxCount),
    bias,
    exact: worstNum === 0n,
    rejectionSampling: true,
    rejectedDrawsPerChunk: Number(rejected),
    rejectionProbabilityPerChunk: Number(rejected) / Number(domain),
  };
}

// ---------------------------------------------------------------------------
// Input handling (§1.1)
// ---------------------------------------------------------------------------

const SEED_HEX = /^[0-9a-fA-F]{64}$/;

/**
 * Decode the 64-hex-character server seed into its 32 raw bytes (§1.1, §1.2, §2 Step 1).
 * Buffer.from(..., 'hex') silently stops at the first bad character, so the
 * form is checked first. Upper-case hex is accepted (same bytes); §1.1 says the
 * seed is published lower-case.
 */
function decodeServerSeed(serverSeed: string): Buffer {
  if (typeof serverSeed !== 'string' || !SEED_HEX.test(serverSeed)) {
    throw new TypeError('serverSeed must be 64 hexadecimal characters (§1.1)');
  }
  return Buffer.from(serverSeed, 'hex');
}

/** §1.1 / §2 Step 1: nonce is a non-negative integer, written in plain base 10. */
function nonceToDecimal(nonce: number): string {
  if (!Number.isSafeInteger(nonce) || nonce < 0) {
    throw new RangeError('nonce must be a non-negative safe integer (§1.1)');
  }
  return nonce.toString(10); // no padding, no sign, no separators
}

// ---------------------------------------------------------------------------
// Roll derivation (§2)
// ---------------------------------------------------------------------------

/**
 * Roll in 0..RANGE-1 from the already-decoded server seed bytes.
 *
 * §2 Step 1: HMAC-SHA256, key = server seed bytes, message = UTF-8 of
 *            `${clientSeed}:${nonce}`.
 * §2 Step 2: walk the 32-byte digest in eight 4-byte chunks, each read as a
 *            big-endian unsigned 32-bit integer; the first chunk below MAX_FAIR
 *            gives roll = chunk mod RANGE.
 * §6 O1:     the spec does not settle what happens if all eight chunks are
 *            rejected (probability about 1e-46). Rather than invent a rule,
 *            this throws.
 */
export function computeResultFromBuffer(keyBuffer: Buffer, clientSeed: string, nonce: number): number {
  if (!Buffer.isBuffer(keyBuffer)) {
    throw new TypeError('keyBuffer must be a Buffer');
  }
  if (typeof clientSeed !== 'string') {
    throw new TypeError('clientSeed must be a string');
  }
  // §2 Step 1 (UTF-8 encoding: §6 O6).
  const message = Buffer.from(`${clientSeed}:${nonceToDecimal(nonce)}`, 'utf8');
  const digest = createHmac('sha256', keyBuffer).update(message).digest();

  // §2 Step 2: chunk offsets 0, 4, ..., 28.
  for (let i = 0; i + 4 <= digest.length; i += 4) {
    const v = digest.readUInt32BE(i);
    if (v < MAX_FAIR) {
      return v % RANGE;
    }
  }
  throw new Error('all 8 digest chunks rejected: continuation is unspecified (§6 O1)');
}

/** Same as computeResultFromBuffer, taking the server seed as published (64 hex chars, §1.1). */
export function computeResult(serverSeed: string, clientSeed: string, nonce: number): number {
  return computeResultFromBuffer(decodeServerSeed(serverSeed), clientSeed, nonce);
}

// ---------------------------------------------------------------------------
// Commitment (§1.2)
// ---------------------------------------------------------------------------

/**
 * §1.2: commitment = lower-case hex of SHA-256 over the 32 decoded seed bytes
 * (not over the 64 ASCII characters). Returns false, never throws, on any
 * malformed input. The published hash is compared case-insensitively, since
 * upper- and lower-case hex name the same bytes.
 */
export function verifyHash(serverSeed: string, serverSeedHashed: string): boolean {
  if (typeof serverSeed !== 'string' || !SEED_HEX.test(serverSeed)) return false;
  if (typeof serverSeedHashed !== 'string' || !SEED_HEX.test(serverSeedHashed)) return false;
  const commitment = createHash('sha256').update(Buffer.from(serverSeed, 'hex')).digest('hex');
  return commitment === serverSeedHashed.toLowerCase();
}

// ---------------------------------------------------------------------------
// Win condition, chance, multiplier for "over" bets (§3.1, §3.2, §3.4)
// ---------------------------------------------------------------------------

/** Lower and upper end of the CONFIG scaling_edge bands, in winning outcomes (§3.3). */
const MIN_BAND_COUNT = 2;
const MAX_BAND_COUNT = 9998;

/** §3.1 "over": win iff roll > target, so count = 10000 - target winning outcomes. */
function overCount(target: number): number {
  if (!Number.isInteger(target) || target < 0 || target > RANGE - 1) {
    throw new RangeError('target must be an integer in 0..10000 (§1.1)');
  }
  return RANGE - 1 - target;
}

/**
 * The edge is only defined where a CONFIG band exists (§3.3: keys run 2..9998),
 * so the multiplier and payout refuse a target whose count falls outside that.
 */
function overCountInBands(target: number): number {
  const count = overCount(target);
  if (count < MIN_BAND_COUNT || count > MAX_BAND_COUNT) {
    throw new RangeError(`count ${count} is outside the scaling_edge bands ${MIN_BAND_COUNT}..${MAX_BAND_COUNT} (§3.3)`);
  }
  return count;
}

/** §3.2: win_chance = count / 10001 (as a float; the 18-dp served form is checked via the grid functions). */
export function theoreticalWinChance(target: number): number {
  return overCount(target) / RANGE;
}

/** §3.4: multiplier = (1 - e) * 10001 / count, audited tier e = 0.001 (as a float). */
export function theoreticalMultiplier(target: number): number {
  const count = overCountInBands(target);
  return (Number(EDGE_NUM) * RANGE) / (Number(EDGE_DEN) * count);
}

// ---------------------------------------------------------------------------
// Exact arithmetic on the 1e-18 grid (§3.2, §3.4, §3.5)
// ---------------------------------------------------------------------------

/**
 * (1 - e) for the audited tier. §3.3: every captured bet used house_edge
 * "0.001", so 1 - e = 999/1000. Other tiers are not modelled (§6 O3).
 */
export const EDGE_NUM: bigint = 999n;
export const EDGE_DEN: bigint = 1000n;

/** Served values carry 18 decimal places (§3.2, §3.4, §3.5). */
export const GRID_DP: number = 18;
export const GRID: bigint = 10n ** 18n;

const PLAIN_DECIMAL = /^(\d+)(?:\.(\d{1,18}))?$/;

/**
 * Served decimal string -> integer count of 1e-18 units.
 * Accepts only a plain non-negative decimal: digits, optionally a dot and 1..18
 * fraction digits. No sign, exponent, whitespace or bare dot. Trailing zeros
 * may have been stripped by the server (§3.5), so the fraction is right-padded.
 * Anything that is not a string returns null (a JSON number may already have
 * lost precision).
 */
export function parseGridUnits(s: unknown): bigint | null {
  if (typeof s !== 'string') return null;
  const m = PLAIN_DECIMAL.exec(s);
  if (m === null) return null;
  const intPart = m[1] as string;
  const fracPart = (m[2] ?? '').padEnd(GRID_DP, '0');
  return BigInt(intPart) * GRID + BigInt(fracPart);
}

/**
 * num/den rounded to the nearest integer, for num >= 0 and den > 0.
 * §3.2 / §3.4 / §3.5 say "rounded to nearest"; §6 O7 leaves the tie mode open
 * (half-up and half-even both fit every captured value). This rounds a tie
 * HALF-UP (away from zero, for these non-negative inputs) and reports tie=true
 * so the caller can see when the choice mattered.
 */
export function roundNearest(num: bigint, den: bigint): { q: bigint; tie: boolean } {
  if (den <= 0n) throw new RangeError('den must be > 0');
  if (num < 0n) throw new RangeError('num must be >= 0');
  const q = num / den;
  const twiceRem = (num % den) * 2n;
  if (twiceRem > den) return { q: q + 1n, tie: false };
  if (twiceRem === den) return { q: q + 1n, tie: true };
  return { q, tie: false };
}

/** §3.4: exact (1 - e) * 10001 / count, rounded once to the 1e-18 grid. */
export function exactMultiplierUnits(target: number): { units: bigint; tie: boolean } {
  const count = BigInt(overCountInBands(target));
  const r = roundNearest(EDGE_NUM * BigInt(RANGE) * GRID, EDGE_DEN * count);
  return { units: r.q, tie: r.tie };
}

/**
 * §3.5 (winning bet): amount * (1 - e) * 10001 / count from the EXACT
 * multiplier, rounded once to the 1e-18 grid. amountUnits is already in
 * 1e-18 units, so the result is too. A losing bet pays 0 (§3.5); deciding
 * win/loss is the caller's job (roll > target, §3.1).
 */
export function exactPayoutUnits(amountUnits: bigint, target: number): { units: bigint; tie: boolean } {
  if (amountUnits < 0n) throw new RangeError('amountUnits must be >= 0');
  const count = BigInt(overCountInBands(target));
  const r = roundNearest(amountUnits * EDGE_NUM * BigInt(RANGE), EDGE_DEN * count);
  return { units: r.q, tie: r.tie };
}
