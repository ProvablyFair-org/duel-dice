/**
 * Unit tests — Duel.com Dice provably fair audit.
 * Run: npm test
 */

import * as assert from 'assert';
import { computeResult, computeResultFromBuffer, verifyHash, theoreticalWinChance, theoreticalMultiplier } from '../../src/rng';

// ── Test vectors (copy-pasted from dice-master-6700bets.json) ─────────────────

const vectors = [
  { serverSeed: '528555039caf67c0219c9537cf6626c63cb0bfa384b72571410e522773270eb5',
    serverSeedHashed: '91afc2eb50c2c801865a533f7b2a3177fc46bda00fcb500bd290ff73f09e1832',
    clientSeed: 'bRNvtSn0hp2uVFRe', nonce: 0, expectedResult: 4234, target: 9313, isWin: false },
  { serverSeed: '528555039caf67c0219c9537cf6626c63cb0bfa384b72571410e522773270eb5',
    serverSeedHashed: '91afc2eb50c2c801865a533f7b2a3177fc46bda00fcb500bd290ff73f09e1832',
    clientSeed: 'bRNvtSn0hp2uVFRe', nonce: 1, expectedResult: 9793, target: 4253, isWin: true },
  { serverSeed: '528555039caf67c0219c9537cf6626c63cb0bfa384b72571410e522773270eb5',
    serverSeedHashed: '91afc2eb50c2c801865a533f7b2a3177fc46bda00fcb500bd290ff73f09e1832',
    clientSeed: 'bRNvtSn0hp2uVFRe', nonce: 2, expectedResult: 8187, target: 1831, isWin: true },
  { serverSeed: '528555039caf67c0219c9537cf6626c63cb0bfa384b72571410e522773270eb5',
    serverSeedHashed: '91afc2eb50c2c801865a533f7b2a3177fc46bda00fcb500bd290ff73f09e1832',
    clientSeed: 'bRNvtSn0hp2uVFRe', nonce: 3, expectedResult: 4345, target: 6990, isWin: false },
  { serverSeed: '528555039caf67c0219c9537cf6626c63cb0bfa384b72571410e522773270eb5',
    serverSeedHashed: '91afc2eb50c2c801865a533f7b2a3177fc46bda00fcb500bd290ff73f09e1832',
    clientSeed: 'bRNvtSn0hp2uVFRe', nonce: 4, expectedResult: 6712, target: 1709, isWin: true },
  { serverSeed: '528555039caf67c0219c9537cf6626c63cb0bfa384b72571410e522773270eb5',
    serverSeedHashed: '91afc2eb50c2c801865a533f7b2a3177fc46bda00fcb500bd290ff73f09e1832',
    clientSeed: 'bRNvtSn0hp2uVFRe', nonce: 5, expectedResult: 6900, target: 6025, isWin: true },
  { serverSeed: '528555039caf67c0219c9537cf6626c63cb0bfa384b72571410e522773270eb5',
    serverSeedHashed: '91afc2eb50c2c801865a533f7b2a3177fc46bda00fcb500bd290ff73f09e1832',
    clientSeed: 'bRNvtSn0hp2uVFRe', nonce: 6, expectedResult: 2790, target: 464, isWin: true },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Cryptographic Core', () => {
  it('computeResult matches expected result for all 7 test vectors', () => {
    for (const v of vectors) {
      const result = computeResult(v.serverSeed, v.clientSeed, v.nonce);
      assert.strictEqual(result, v.expectedResult,
        `serverSeed=${v.serverSeed.slice(0, 8)}… nonce=${v.nonce}: expected ${v.expectedResult}, got ${result}`);
    }
  });

  it('computeResultFromBuffer matches computeResult for all test vectors', () => {
    for (const v of vectors) {
      const key      = Buffer.from(v.serverSeed, 'hex');
      const fromBuf  = computeResultFromBuffer(key, v.clientSeed, v.nonce);
      const fromStr  = computeResult(v.serverSeed, v.clientSeed, v.nonce);
      assert.strictEqual(fromBuf, fromStr);
    }
  });

  it('HMAC key must be hex-decoded bytes — confirms correct encoding against known vectors', () => {
    // If key were UTF-8 string, results would differ
    for (const v of vectors) {
      const correct  = computeResult(v.serverSeed, v.clientSeed, v.nonce);
      const wrongKey = Buffer.from(v.serverSeed, 'utf-8');
      const wrong    = computeResultFromBuffer(wrongKey, v.clientSeed, v.nonce);
      assert.notStrictEqual(correct, wrong,
        `Vector with nonce=${v.nonce}: hex vs UTF-8 key should differ`);
    }
  });

  it('result is always an integer in range [0, 10000]', () => {
    for (const v of vectors) {
      const r = computeResult(v.serverSeed, v.clientSeed, v.nonce);
      assert.ok(Number.isInteger(r) && r >= 0 && r <= 10000,
        `result=${r} out of range [0, 10000]`);
    }
  });

  it('win condition matches expected is_win for all 7 test vectors', () => {
    for (const v of vectors) {
      const result   = computeResult(v.serverSeed, v.clientSeed, v.nonce);
      const computed = result > v.target;
      assert.strictEqual(computed, v.isWin,
        `nonce=${v.nonce} target=${v.target} result=${result}: expected isWin=${v.isWin}`);
    }
  });

  it('verifyHash confirms commit-reveal integrity for all 7 known server seeds', () => {
    for (const v of vectors) {
      assert.ok(verifyHash(v.serverSeed, v.serverSeedHashed),
        `Hash mismatch for serverSeed=${v.serverSeed.slice(0, 8)}…`);
    }
  });

  it('verifyHash rejects a tampered server seed', () => {
    const v       = vectors[0];
    const tampered = 'ff' + v.serverSeed.slice(2);
    assert.strictEqual(verifyHash(tampered, v.serverSeedHashed), false);
  });

  it('verifyHash rejects a tampered hash', () => {
    const v          = vectors[0];
    const tamperedH  = 'ff' + v.serverSeedHashed.slice(2);
    assert.strictEqual(verifyHash(v.serverSeed, tamperedH), false);
  });

  it('different nonces produce different results (nonce influence)', () => {
    const v   = vectors[0];
    const r0  = computeResult(v.serverSeed, v.clientSeed, 0);
    const r1  = computeResult(v.serverSeed, v.clientSeed, 1);
    assert.notStrictEqual(r0, r1);
  });

  it('different client seeds produce different results', () => {
    const v  = vectors[0];
    const r1 = computeResult(v.serverSeed, 'seedAlpha', 0);
    const r2 = computeResult(v.serverSeed, 'seedBeta',  0);
    assert.notStrictEqual(r1, r2);
  });
});

describe('Payout Formulas', () => {
  it('theoreticalWinChance matches live API values for all 7 test vectors', () => {
    // Independently computed: win_chance = (10000 - target) / 10001
    const expected: Record<number, number> = {
      9313: 687  / 10001,
      4253: 5747 / 10001,
      1831: 8169 / 10001,
      6990: 3010 / 10001,
      1709: 8291 / 10001,
      6025: 3975 / 10001,
      464:  9536 / 10001,
    };
    for (const [target, exp] of Object.entries(expected)) {
      const actual = theoreticalWinChance(Number(target));
      assert.ok(Math.abs(actual - exp) < 1e-14,
        `target=${target}: expected ${exp}, got ${actual}`);
    }
  });

  it('theoreticalMultiplier = 0.999 / win_chance for all test vector targets', () => {
    for (const v of vectors) {
      const wc       = theoreticalWinChance(v.target);
      const expected = 0.999 / wc;
      const actual   = theoreticalMultiplier(v.target);
      assert.ok(Math.abs(actual - expected) < 1e-12,
        `target=${v.target}: expected ${expected}, got ${actual}`);
    }
  });

  it('RTP = win_chance × multiplier = 0.999 for all test vector targets', () => {
    for (const v of vectors) {
      const wc   = theoreticalWinChance(v.target);
      const mult = theoreticalMultiplier(v.target);
      const rtp  = wc * mult;
      assert.ok(Math.abs(rtp - 0.999) < 1e-12,
        `target=${v.target}: RTP=${rtp}, expected 0.999`);
    }
  });

  it('house edge is exactly 0.1% (RANGE=10001 not 10000)', () => {
    // win_chance_fair = (10000 - target) / 10000
    // win_chance_actual = (10000 - target) / 10001
    // multiplier = 0.999 / win_chance_actual → always 99.9% RTP
    const target  = 5000;
    const fair    = 5000 / 10000;  // 0.5 exactly
    const actual  = theoreticalWinChance(target);
    assert.ok(actual < fair, 'Actual win chance should be less than fair (house edge present)');
    const rtp = actual * theoreticalMultiplier(target);
    assert.ok(Math.abs(rtp - 0.999) < 1e-12, `RTP should be 0.999, got ${rtp}`);
  });
});
