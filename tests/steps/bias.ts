/**
 * Step 19: Draw Bias Bound (Sampling Uniformity)
 *
 * Every other RNG step proves the draw REPRODUCES — that the roll recorded is the roll the
 * declared algorithm computes from the revealed seed. None of them asks whether that algorithm
 * draws the 10,001 lattice points EQUALLY. If the rejection window did not hold a whole number
 * of ranges, the low residues would be over-represented, and every one of the 6,700 exact
 * recomputations in Step 5 would be an exact recomputation of a biased draw.
 *
 * This step closes that gap. It computes the worst-case modulo bias from the same three constants
 * the draw reads (RANGE, MAX_U32, MAX_FAIR), asserts MAX_FAIR is a whole number of ranges and the
 * bias is inside the profile's 2^-32 ceiling, and prints the rejection census the profile asks for
 * when rejection sampling is the mechanism. The bound is arithmetic, not a live statistic, so it
 * holds for every possible seed rather than for the 6,700 that were captured.
 */

import type { StepResult } from './context';
import { step, VerifyContext } from './context';
import { drawBiasBound } from '../../src/rng';

/**
 * The profile's ceiling on modulo bias (methodology S2): a draw biased by more than one part in
 * 2^32, without rejection sampling to correct it, is a hard fail. Declared here as the number it
 * is so the comparison is arithmetic.
 */
const BIAS_CEILING = Math.pow(2, -32);

export function run(_ctx: VerifyContext): StepResult[] {
  const b = drawBiasBound();

  const issues: string[] = [];
  if (!b.wholeNumberOfRanges) {
    issues.push(
      `MAX_FAIR ${b.maxFair} is not a whole number of ranges: ${b.maxFair} % ${b.range} = ${b.remainder} `
      + `(the accepted window over-represents the low ${b.remainder} residues)`,
    );
  }
  if (!(b.bias <= BIAS_CEILING)) {
    issues.push(`worst-case modulo bias ${b.bias} exceeds the 2^-32 ceiling ${BIAS_CEILING}`);
  }

  const s19 = step(19, 'Draw Bias Bound (Sampling Uniformity)',
    issues.length === 0 ? 'PASS' : 'FAIL',
    issues.length === 0
      ? `Rejection sampling over a ${b.domainSize.toLocaleString()}-value uint32 domain: `
        + `MAX_FAIR = ${b.range} × ${b.rangesAccepted} = ${b.maxFair} is an exact whole number of ranges, `
        + `so each of the ${b.range} residues receives exactly ${b.rangesAccepted} of the accepted values and the `
        + `worst-case modulo bias is 0, inside the profile's 2^-32 ceiling. Rejection census: `
        + `${b.rejectedDrawsPerChunk} of ${b.domainSize} chunk values fall in the discarded tail `
        + `[MAX_FAIR, 2^32) — a per-chunk rejection probability reported in this step's data block.`
      : `DRAW BIAS: ${issues.join('; ')}`,
    {
      ...b,
      ceiling: BIAS_CEILING,
      withinCeiling: b.bias <= BIAS_CEILING,
      maxFairFactorisation: `${b.range} × ${b.rangesAccepted}`,
      issues,
    },
  );

  return [s19];
}
