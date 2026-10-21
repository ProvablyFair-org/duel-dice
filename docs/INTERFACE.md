# Module interface the audit package expects (written by the auditor, not from the casino)

Write `rng.ts` (TypeScript, strict, Node `crypto` only, no dependencies) exporting exactly these names.
Semantics come from ALGORITHM.md; this file only fixes names and types.

```ts
export const RANGE: number;      // number of distinct roll outcomes
export const MAX_U32: number;    // largest 32-bit unsigned value
export const MAX_FAIR: number;   // rejection limit: values >= this are discarded

// Analytic bias report for the draw, computed from the three constants above (no sampling).
export function drawBiasBound(): {
  algorithm: 'rejection-sampling';
  range: number; maxU32: number; maxFair: number;
  rangesAccepted: number;          // MAX_FAIR / RANGE
  wholeNumberOfRanges: boolean;
  domainSize: number;              // 2^32
  remainder: number;               // domainSize - MAX_FAIR
  minResidueCount: number; maxResidueCount: number;  // over accepted values
  bias: number;                    // worst-case |P(residue) - 1/RANGE|
  exact: boolean;                  // bias is exactly 0
  rejectionSampling: boolean;
  rejectedDrawsPerChunk: number;   // count of rejected 32-bit values
  rejectionProbabilityPerChunk: number;
};

// Roll (integer, 0..RANGE-1) from the HMAC key bytes already decoded from the server seed.
export function computeResultFromBuffer(keyBuffer: Buffer, clientSeed: string, nonce: number): number;
// Same, taking the server seed as the casino publishes it.
export function computeResult(serverSeed: string, clientSeed: string, nonce: number): number;
// Commitment check: does serverSeed hash to the published serverSeedHashed?
export function verifyHash(serverSeed: string, serverSeedHashed: string): boolean;

// "over" bets at integer target t (roll must exceed t), audited edge tier.
export function theoreticalWinChance(target: number): number;
export function theoreticalMultiplier(target: number): number;

// Exact arithmetic on a grid of 1e-18 units (BigInt).
export const EDGE_NUM: bigint; export const EDGE_DEN: bigint;  // (1 - edge) as a ratio, audited tier
export const GRID_DP: number;    // 18
export const GRID: bigint;       // 10n ** 18n
// Served decimal string -> integer 1e-18 units; null if not a plain non-negative decimal with <= 18 fraction digits.
export function parseGridUnits(s: unknown): bigint | null;
// num/den rounded to nearest; tie = true when exactly halfway (state which way you round a tie, per the spec).
export function roundNearest(num: bigint, den: bigint): { q: bigint; tie: boolean };
// Exact multiplier at target, in 1e-18 units.
export function exactMultiplierUnits(target: number): { units: bigint; tie: boolean };
// Exact payout for a stake given in 1e-18 units, at target, in 1e-18 units.
export function exactPayoutUnits(amountUnits: bigint, target: number): { units: bigint; tie: boolean };
```
