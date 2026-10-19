/**
 * RTP-CLAIM wiring — Duel Dice: the per-setting exact RTP table and the claim it is held to.
 *
 * The rule is src/rtp-claim.ts, a byte-identical copy of the framework's core/rtp-claim.ts (its
 * SHA-256 is compared by conformance C-13), version 1.2.0 (Methodology v1.1, agreed 2026-10-14;
 * 1.1.0 2026-10-01, 1.0.0 2026-09-29). The enforcement switch RTP_CLAIM_RULE_ENFORCED is the
 * package's own src/rtp-claim-switch.ts, set to true (decision D3, 2026-10-14): the outcome is
 * scored on the step carrying DICE-19, and a house-side miss makes the verdict RTP FIGURE OVERSTATED
 * (exit 5), never NOT PROVABLY FAIR. The claim names one of the rule's six places (game page,
 * fairness page, help page, bet panel, rules, game settings): here the fairness page.
 *
 * SETTINGS. Every legal integer target 2–9998, roll-over only (MANIFEST.md#game-and-algorithm; 6,700/6,700 captured
 * bets are bet_type = over): 9,997 settings.
 * EXACT RTP. P(win) = (10000 − t)/10001 (roll = uint32 by rejection sampling on 10001, exactly
 * uniform — src/rng.ts:55-57) × the settled multiplier, which is the EXACT declared formula
 * 999·10001 / (1000·(10000 − t)) (src/rng.ts:192-193, exactPayoutUnits: a win is settled on the
 * exact rational, not the rounded served string). Integer arithmetic, no float.
 * CLAIM. Flat 0.1 % house edge = RTP 999/1000, the published fairness page's edge factor 0.999
 * (MANIFEST.md#payouts-and-rtp; declaration duel.dice outcome.edge.claimed 0.001). This is the
 * base (0.1 %) edge tier, which holds every captured bet. The duel.com dice config as fetched
 * 2026-10-05 in a logged-in session (read-only GET; E14) scales the edge with stake above it, up to 1.0 %
 * (less where its $3m max bet ends the ladder); those tiers are not scored here
 * (MANIFEST.md#scaling-edge, DL-15).
 *
 *   npm run rtp-claim:write    rewrite outputs/rtp-claim-table.json and print its SHA-256 to pin
 */
import * as path from 'path';
import * as fs from 'fs';
import { createHash } from 'crypto';
import { RtpClaim, RtpClaimAccumulator, RtpClaimResult, rtpClaimTable, rtpClaimGate, RtpClaimGate } from './rtp-claim';
import { RANGE, EDGE_NUM, EDGE_DEN } from './rng';

export const RTP_CLAIM: RtpClaim = {
  kind: 'flat',
  rtp: '0.999',
  source: 'fairness page (Duel\'s Provably Fair page): payout multiplier = 0.999 / win chance, a flat 0.1 % house edge at the base edge tier; the duel.com dice config as fetched 2026-10-05 in a logged-in session (read-only GET; E14) scales the edge above it, not scored here (MANIFEST.md#payouts-and-rtp, MANIFEST.md#scaling-edge; declaration outcome.edge.claimed 0.001)',
};

/** The scored step that carries DICE-19 (src/profile-map.ts). */
export const RTP_CLAIM_STEP = 13;

export const RTP_CLAIM_TABLE = path.join(__dirname, '..', 'outputs', 'rtp-claim-table.json');
/** SHA-256 of the committed table — re-pin with the run that rewrote it (npm run rtp-claim:write). */
export const RTP_CLAIM_TABLE_SHA256 = 'a69f53df3681ea1b419d18e8fbf044c50bdcfe85a5562d67c8f89e91e400f3c0';

export function computeRtpClaim(): RtpClaimResult {
  const acc = new RtpClaimAccumulator(RTP_CLAIM);
  const R = BigInt(RANGE);
  for (let t = 2; t <= 9998; t++) {
    const wins = BigInt(10000 - t);                       // rolls t+1 … 10000
    // P(win) × multiplier = wins/R × (EDGE_NUM·R)/(EDGE_DEN·wins)
    acc.add(`target=${t} over`, wins * EDGE_NUM * R, R * EDGE_DEN * wins);
  }
  return acc.result();
}

export function rtpClaimTableText(r: RtpClaimResult): string {
  return rtpClaimTable(r, {
    package: 'duel/dice', game: 'dice',
    settingSpace: 'integer target 2–9998, roll over, 0.1 % edge tier (9,997 settings)',
    rtpMethod: 'exact rational: (10000 − t)/10001 × 999·10001/(1000·(10000 − t)), the settled multiplier',
  });
}

export function runRtpClaimGate(): RtpClaimGate {
  const r = computeRtpClaim();
  return rtpClaimGate(r, rtpClaimTableText(r), RTP_CLAIM_TABLE, RTP_CLAIM_TABLE_SHA256);
}

if (require.main === module) {
  const text = rtpClaimTableText(computeRtpClaim());
  fs.writeFileSync(RTP_CLAIM_TABLE, text);
  console.log(`wrote outputs/rtp-claim-table.json sha256 ${createHash('sha256').update(text).digest('hex')}`);
}
