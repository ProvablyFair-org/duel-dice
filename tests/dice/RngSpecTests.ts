/**
 * Spec self-test — docs/ALGORITHM.md §5 vectors and properties, run against src/rng.ts.
 *
 * Written by the clean-room implementer together with src/rng.ts, from docs/ALGORITHM.md and the module
 * interface alone (never from Duel's code). Integrated 20 Oct 2026: the checks are unchanged; only the
 * import path, the mocha wrapper and the reporting (failures collected instead of printed) were adapted.
 * The rejection-path search hashes 3,000,000 nonces, hence the longer timeout.
 */
import { createHash, createHmac } from 'crypto';
import {
  RANGE, MAX_U32, MAX_FAIR, drawBiasBound,
  computeResultFromBuffer, computeResult, verifyHash,
  theoreticalWinChance, theoreticalMultiplier,
  EDGE_NUM, EDGE_DEN, GRID_DP, GRID,
  parseGridUnits, roundNearest, exactMultiplierUnits, exactPayoutUnits,
} from '../../src/rng';
import * as assert from 'assert';

const EXPECTED_CHECKS = 79;

function runSelftest(): { pass: number; total: number; failed: string[] } {

    let pass = 0;
    let total = 0;
    const failed: string[] = [];
    function check(name: string, cond: boolean, detail = ''): void {
      total++;
      if (cond) pass++;
      else failed.push(`${name}${detail ? '  ' + detail : ''}`);
    }
    function throws(fn: () => unknown): boolean {
      try { fn(); return false; } catch { return true; }
    }

    // ---- §5 vectors ------------------------------------------------------------
    interface Vec {
      id: string; serverSeed: string; commitment: string; clientSeed: string; nonce: number;
      target: number; amount: string; hmac: string; u32: number; roll: number; win: boolean;
      winChance: string; multiplier: string; amountWon: string;
    }
    const vectors: Vec[] = [
      { id: 'V1 50120986', serverSeed: '528555039caf67c0219c9537cf6626c63cb0bfa384b72571410e522773270eb5',
        commitment: '91afc2eb50c2c801865a533f7b2a3177fc46bda00fcb500bd290ff73f09e1832',
        clientSeed: 'bRNvtSn0hp2uVFRe', nonce: 0, target: 9313, amount: '0.01',
        hmac: '91cb700c3aaa8b1844882f2ce3bc7a8500afe54715dc36d27a234f188c264708',
        u32: 2446028812, roll: 4234, win: false,
        winChance: '0.068693130686931307', multiplier: '14.542938864628820961', amountWon: '0' },
      { id: 'V2 50147522', serverSeed: '9089447ee52c50f7681df2e81d1c18c7511211541d816700d2d9cbf5e21e59e1',
        commitment: 'dbd84e4f9c7c7bec84778bef7eb1b40e265d406657d02339ad4443d90e44cb75',
        clientSeed: 'TWGFOVLB7Hn0nEYz', nonce: 30, target: 4614, amount: '0.01',
        hmac: 'e833934055d988afdac0159e80b6c813c9d91e1211bfdd211f76284bc596d443',
        u32: 3895694144, roll: 4614, win: false,
        winChance: '0.538546145385461454', multiplier: '1.854994244337170442', amountWon: '0' },
      { id: 'V3 50126115', serverSeed: '62d76145dc7af725c1266e3dba55ab6961bc69126fb3abac92d3a84361d728aa',
        commitment: '34d53ac2b95b6bfe6ba7a013150eff61d5e96e8c2a4f90a377daa0800c93796f',
        clientSeed: 'A4pdyxBckF41ia9i', nonce: 41, target: 9855, amount: '0.01',
        hmac: '693bf2e232516ddc4ffa5b787b7cb5ffafde5969a2ff6b4bda16ce570ce61f14',
        u32: 1765536482, roll: 9947, win: true,
        winChance: '0.014498550144985501', multiplier: '68.903441379310344828', amountWon: '0.689034413793103448' },
      { id: 'V4 50157310', serverSeed: 'b0ec2ba42759cc0368488642ab663ba527255dd0e7fd0dc81ca76883471069ec',
        commitment: '814e15a1efcd26e802acb4086bdbfd48288fcae3c1f95d47ef1b8acf6e321ed0',
        clientSeed: '6RCe8mGoswFFojub', nonce: 31, target: 9700, amount: '10',
        hmac: 'd5be73c59778355f8c21352d82c35e6d025e5706825e3705ff914fdd91173f59',
        u32: 3586028485, roll: 9919, win: true,
        winChance: '0.029997000299970003', multiplier: '33.303330000000000000', amountWon: '333.0333' },
      { id: 'V5 50158143', serverSeed: '8195d9a7126ba92f95891d7fe360841f7ba29493576eed666b425c9ca1edc130',
        commitment: '2e90e18331cf62073b312e2f8fce9117f73e45167b84fcf905d4777330ccc1b0',
        clientSeed: 'pfauditmnugzvwf', nonce: 21, target: 9700, amount: '0.01',
        hmac: 'd3919ab10f163d3c379c3481ef58632aae38060aa25671308e24a148397a0f35',
        u32: 3549534897, roll: 9980, win: true,
        winChance: '0.029997000299970003', multiplier: '33.303330000000000000', amountWon: '0.3330333' },
    ];

    for (const v of vectors) {
      const key = Buffer.from(v.serverSeed, 'hex');
      const digest = createHmac('sha256', key).update(`${v.clientSeed}:${v.nonce}`, 'utf8').digest();
      check(`${v.id} commitment`, verifyHash(v.serverSeed, v.commitment));
      check(`${v.id} HMAC digest`, digest.toString('hex') === v.hmac);
      check(`${v.id} u32`, digest.readUInt32BE(0) === v.u32);
      const roll = computeResult(v.serverSeed, v.clientSeed, v.nonce);
      check(`${v.id} roll`, roll === v.roll, `got ${roll}`);
      check(`${v.id} roll (buffer form)`, computeResultFromBuffer(key, v.clientSeed, v.nonce) === v.roll);
      check(`${v.id} win flag (roll > target)`, (roll > v.target) === v.win);
      const count = BigInt(RANGE - 1 - v.target);
      check(`${v.id} win_chance 18dp`, roundNearest(count * GRID, BigInt(RANGE)).q === parseGridUnits(v.winChance));
      check(`${v.id} win_chance float`, Math.abs(theoreticalWinChance(v.target) - Number(v.winChance)) < 1e-15);
      check(`${v.id} multiplier 18dp`, exactMultiplierUnits(v.target).units === parseGridUnits(v.multiplier));
      check(`${v.id} multiplier float`, Math.abs(theoreticalMultiplier(v.target) / Number(v.multiplier) - 1) < 1e-12);
      const amountUnits = parseGridUnits(v.amount);
      const paid = v.win && amountUnits !== null ? exactPayoutUnits(amountUnits, v.target).units : 0n;
      check(`${v.id} amount_won`, paid === parseGridUnits(v.amountWon), `got ${paid}`);
    }

    // V6: Duel's public Verify page (roll only).
    check('V6 Verify page roll 791 ("7.91")',
      computeResult('7b3c099fb0aacfb97c1e6772389e1b3eec2a8d7d6d07488bf745b0f9b2d03714', '5icuhQS3ze', 0) === 791);
    check('V6 u32 3985829334',
      createHmac('sha256', Buffer.from('7b3c099fb0aacfb97c1e6772389e1b3eec2a8d7d6d07488bf745b0f9b2d03714', 'hex'))
        .update('5icuhQS3ze:0').digest().readUInt32BE(0) === 3985829334);

    // ---- constants and bias report ----------------------------------------------
    check('RANGE = 10001', RANGE === 10001);
    check('MAX_U32 = 2^32-1', MAX_U32 === 4294967295);
    check('MAX_FAIR = 4294959453', MAX_FAIR === 4294959453);
    const b = drawBiasBound();
    check('bias: rangesAccepted = 429453 = MAX_FAIR/RANGE', b.rangesAccepted === 429453 && b.rangesAccepted * RANGE === MAX_FAIR);
    check('bias: whole number of ranges', b.wholeNumberOfRanges);
    check('bias: domainSize = 2^32', b.domainSize === 2 ** 32);
    check('bias: remainder = 7843 = domain - MAX_FAIR', b.remainder === 7843 && b.remainder === b.domainSize - b.maxFair);
    check('bias: residue counts equal (429453)', b.minResidueCount === 429453 && b.maxResidueCount === 429453);
    check('bias: exactly 0', b.bias === 0 && b.exact);
    check('bias: rejected draws = remainder, p = 7843/2^32',
      b.rejectionSampling && b.rejectedDrawsPerChunk === 7843 && b.rejectionProbabilityPerChunk === 7843 / 2 ** 32);

    // ---- grid helpers -----------------------------------------------------------
    check('GRID_DP/GRID', GRID_DP === 18 && GRID === 10n ** 18n && EDGE_NUM === 999n && EDGE_DEN === 1000n);
    check('parseGridUnits accepts plain decimals',
      parseGridUnits('0') === 0n && parseGridUnits('10') === 10n * GRID && parseGridUnits('0.3330333') === 333033300000000000n
      && parseGridUnits('1.000000000000000001') === GRID + 1n);
    check('parseGridUnits rejects non-plain input',
      [ '-1', '1e3', '.5', '1.', ' 1', '1.0000000000000000001', '', 'abc', 1, null, undefined ]
        .every((x) => parseGridUnits(x) === null));
    check('roundNearest: below, above, tie (half-up)',
      roundNearest(14n, 10n).q === 1n && roundNearest(16n, 10n).q === 2n
      && roundNearest(15n, 10n).q === 2n && roundNearest(15n, 10n).tie && !roundNearest(16n, 10n).tie
      && roundNearest(25n, 10n).q === 3n);

    // ---- hash check false cases -------------------------------------------------
    const s1 = vectors[0] as Vec;
    check('verifyHash false: other vector commitment', !verifyHash(s1.serverSeed, (vectors[1] as Vec).commitment));
    check('verifyHash false: hash of ASCII hex string (§1.2 rejected form)',
      !verifyHash(s1.serverSeed, createHash('sha256').update(s1.serverSeed, 'utf8').digest('hex')));
    check('verifyHash false: malformed seed / hash', !verifyHash('zz' + s1.serverSeed.slice(2), s1.commitment)
      && !verifyHash(s1.serverSeed, s1.commitment.slice(1)));
    check('verifyHash true: upper-case published hash', verifyHash(s1.serverSeed, s1.commitment.toUpperCase()));

    // ---- input validation -------------------------------------------------------
    check('computeResult rejects bad seed / nonce',
      throws(() => computeResult('abc', 'x', 0)) && throws(() => computeResult(s1.serverSeed, 'x', -1))
      && throws(() => computeResult(s1.serverSeed, 'x', 1.5)));
    check('multiplier refuses counts outside bands 2..9998',
      throws(() => theoreticalMultiplier(10000)) && throws(() => theoreticalMultiplier(9999))
      && throws(() => exactMultiplierUnits(0)) && !throws(() => exactMultiplierUnits(9998)) && !throws(() => exactMultiplierUnits(2)));

    // ---- roll range, and the rejection path ------------------------------------
    // Search nonces on V1's seed for digests whose first chunk is >= MAX_FAIR,
    // and check the module then uses the next acceptable chunk (§2 Step 2).
    {
      const key = Buffer.from(s1.serverSeed, 'hex');
      let inRange = true;
      let rejHits = 0;
      let rejOk = true;
      const N = 3_000_000;
      for (let n = 0; n < N; n++) {
        const d = createHmac('sha256', key).update(`${s1.clientSeed}:${n}`).digest();
        const first = d.readUInt32BE(0);
        if (n < 200_000 || first >= MAX_FAIR) {
          const r = computeResultFromBuffer(key, s1.clientSeed, n);
          if (!Number.isInteger(r) || r < 0 || r > RANGE - 1) inRange = false;
          if (first >= MAX_FAIR) {
            rejHits++;
            let expected = -1;
            for (let i = 4; i < 32; i += 4) { const v = d.readUInt32BE(i); if (v < MAX_FAIR) { expected = v % RANGE; break; } }
            if (r !== expected) rejOk = false;
            if (r === first % RANGE) { /* coincidence is allowed, not checked */ }
          }
        }
      }
      check('roll in 0..10000 (200000 nonces + rejection hits)', inRange);
      check(`rejection path takes next chunk (${rejHits} first-chunk rejections in ${N} nonces)`, rejHits > 0 && rejOk);
    }


  return { pass, total, failed };
}

describe('Spec self-test — src/rng.ts against docs/ALGORITHM.md (clean-room rebuild)', function () {
  this.timeout(300_000);
  it(`all ${EXPECTED_CHECKS} spec vector and property checks pass`, () => {
    const r = runSelftest();
    assert.deepStrictEqual(r.failed, []);
    assert.strictEqual(r.total, EXPECTED_CHECKS);
    assert.strictEqual(r.pass, EXPECTED_CHECKS);
  });
});
