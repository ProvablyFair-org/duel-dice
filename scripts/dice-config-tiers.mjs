#!/usr/bin/env node
/**
 * What does Duel's dice config (E14) say, and where do the captured bets sit in it?
 *
 *   node scripts/dice-config-tiers.mjs
 *
 * Reads evidence/E14-dice-scaling-config-2026-10-05.json, the exact response body of
 * GET /api/v2/dice/config, the duel.com dice config as fetched 2026-10-05 in a logged-in session
 * (read-only GET; fetched_utc in the .meta.json beside it), and the dataset of record. Both are
 * checked against their SHA-256 first; a mismatch exits 1. Read-only: writes nothing.
 *
 * Prints every figure the MANIFEST "Scaling edge" section quotes:
 *   - the table's shape: ranges, tiers per range, floor and top edge, edge step, contiguity, max bet;
 *   - the implied bankroll of every tier below the max-bet cap;
 *   - the example rows (0.1 % tier ceiling, start of the 1.0 % tier, max bet) at fixed targets;
 *   - the tier of each of the 6,700 captured bets.
 *
 * Range reading. Each `scaling_edge` key is a range's lower bound and `range_to` its upper bound,
 * in winning roll values for a roll-over bet, 10000 − target (the key 2 / range_to 2 range is target
 * 9,998, whose win chance is 2/10001). The config does not say how Duel's server picks a range; this
 * script reads a range as covering key ≤ 10000 − target ≤ range_to, and a stake as in the first tier
 * whose max_bet it does not exceed (tiers start at 0 and are contiguous, checked below).
 *
 * Time scope. E14 is dated 2026-10-05; the capture ran 2026-04-11. Where the bets fall in E14 is
 * where they WOULD fall under that config. The config in force at capture time is not in this
 * package; the bet-time witness of each bet's tier is its served effective_edge and Step 9's price.
 *
 * Information only: no scored step reads E14, and nothing here moves a step or the verdict.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const E14 = 'evidence/E14-dice-scaling-config-2026-10-05.json';
const E14_SHA256 = '745be0686f27f94eb74930a71847d97b087780ba27eecbb60bf989257c025c1d';
const DATASET = 'data/dice-master-6700bets.json';
const DATASET_SHA256 = '3550ffca07a6f7825f96cdd4e3d8c3cd57898b5b5238b9739753a754cff056d6';
const RANGE = 10001;
const BANKROLL = 25_000_000;

function readPinned(rel, want) {
  const raw = fs.readFileSync(path.join(root, rel));
  const got = createHash('sha256').update(raw).digest('hex');
  if (got !== want) { console.error(`FAIL: ${rel} sha256 ${got}, expected ${want}`); process.exit(1); }
  return JSON.parse(raw.toString('utf8'));
}

// Decimal string → integer units of 1e-18 (exact).
const DP = 18n;
function units(s) {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(String(s));
  if (!m) throw new Error(`not a plain decimal: ${s}`);
  const f = (m[2] || '').padEnd(Number(DP), '0');
  if (f.length > Number(DP)) throw new Error(`more than 18 dp: ${s}`);
  return BigInt(m[1]) * 10n ** DP + BigInt(f);
}
const usd = x => '$' + Number(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = e => (Number(e) * 100).toFixed(2).replace(/0$/, '') + '%';

const cfg = readPinned(E14, E14_SHA256);
const ds = readPinned(DATASET, DATASET_SHA256);
if (cfg.success !== true || !cfg.data || typeof cfg.data.scaling_edge !== 'object') {
  console.error('FAIL: E14 is not {success: true, data: {scaling_edge}}'); process.exit(1);
}
const se = cfg.data.scaling_edge;
const ranges = Object.keys(se).map(k => ({ key: Number(k), to: se[k].range_to, tiers: se[k].tiers }))
  .sort((a, b) => a.key - b.key);

// ── Shape ────────────────────────────────────────────────────────────────────
let gaps = 0, steps = 0, inverted = 0, rangeGaps = 0, prevTo = ranges[0].key - 1;
const dist = new Map(), tops = new Map(), cfgIds = new Set(), firstMin = new Set(), firstEdge = new Set();
let rows = 0, capMax = 0n;
const CAP = units('3000000');
for (const r of ranges) {
  if (r.key !== prevTo + 1) rangeGaps++;
  prevTo = r.to;
  rows += r.tiers.length;
  dist.set(r.tiers.length, (dist.get(r.tiers.length) || 0) + 1);
  const top = r.tiers[r.tiers.length - 1];
  tops.set(top.house_edge, (tops.get(top.house_edge) || 0) + 1);
  firstMin.add(r.tiers[0].min_bet); firstEdge.add(r.tiers[0].house_edge);
  if (units(top.max_bet) > capMax) capMax = units(top.max_bet);
  r.tiers.forEach((t, i) => {
    cfgIds.add(t.config_id);
    if (units(t.max_bet) <= units(t.min_bet)) inverted++;
    if (i > 0) {
      if (t.min_bet !== r.tiers[i - 1].max_bet) gaps++;
      if (units(t.house_edge) - units(r.tiers[i - 1].house_edge) !== units('0.0001')) steps++;
    }
  });
}
const full = ranges.filter(r => r.tiers.length === 91);
const short = ranges.filter(r => r.tiers.length !== 91);
const maxFull = full.reduce((m, r) => { const v = units(r.tiers[90].max_bet); return v > m ? v : m; }, 0n);
console.log(`E14 ${E14}`);
console.log(`  sha256 ${E14_SHA256} (matches)`);
console.log(`  data keys: ${Object.keys(cfg.data).join(', ')}`);
console.log(`  ranges: ${ranges.length}, covering 10000 − target = ${ranges[0].key}..${ranges[ranges.length - 1].to} `
  + `(targets ${10000 - ranges[ranges.length - 1].to}..${10000 - ranges[0].key}); gaps between ranges: ${rangeGaps}`);
console.log(`  tier rows: ${rows}; config_id: ${[...cfgIds].join(', ')}`);
console.log(`  tiers per range: ${[...dist].sort((a, b) => a[0] - b[0]).map(([n, c]) => `${n}×${c}`).join(', ')}`);
console.log(`  first tier: min_bet ${[...firstMin].join(', ')}, house_edge ${[...firstEdge].join(', ')} on all ${ranges.length}`);
console.log(`  top tier house_edge: ${[...tops].sort((a, b) => Number(a[0]) - Number(b[0])).map(([e, c]) => `${e}×${c}`).join(', ')}`);
console.log(`  edge steps other than 0.0001: ${steps}; max_bet ≠ next min_bet: ${gaps}; empty or inverted tiers: ${inverted}`);
console.log(`  largest max_bet: ${usd(Number(capMax) / 1e18)}; the ${full.length} ranges with 91 tiers top out at `
  + `${usd(Number(maxFull) / 1e18)} or less`);
console.log(`  ranges with fewer than 91 tiers (all end at max_bet ${usd(3e6)}):`);
for (const r of short) {
  const top = r.tiers[r.tiers.length - 1];
  console.log(`    ${r.key}..${r.to} (targets ${10000 - r.to}..${10000 - r.key}): ${r.tiers.length} tiers, top edge `
    + `${pct(top.house_edge)}, last max_bet ${usd(top.max_bet)}${units(top.max_bet) === CAP ? ' (= cap)' : ''}`);
}

// ── Implied bankroll ─────────────────────────────────────────────────────────
// At edge e and win chance c = key / 10001 (the range's longest odds), a stake s has potential
// profit s × ((1 − e)/c − 1). The bankroll implied by a tier is max_bet × that / e.
let bMin = Infinity, bMax = -Infinity, aMin = Infinity, aMax = -Infinity, nB = 0, p1Min = Infinity, p1Max = -Infinity;
for (const r of ranges) {
  const c = r.key / RANGE;
  r.tiers.forEach((t, i) => {
    const e = Number(t.house_edge), m = Number(t.max_bet);
    if (i === 0) { const p = m * (0.999 / c - 1); p1Min = Math.min(p1Min, p); p1Max = Math.max(p1Max, p); }
    if (units(t.max_bet) === CAP) return;
    nB++;
    const b = m * ((1 - e) / c - 1) / e;  bMin = Math.min(bMin, b); bMax = Math.max(bMax, b);
    const a = m * (0.999 / c - 1) / e;    aMin = Math.min(aMin, a); aMax = Math.max(aMax, a);
  });
}
const dev = Math.max(Math.abs(bMin - BANKROLL), Math.abs(bMax - BANKROLL)) / BANKROLL;
console.log(`\nImplied bankroll, ${nB} tiers below the ${usd(3e6)} cap, win chance at each range's lower bound / 10001:`);
console.log(`  multiplier (1 − edge)/win_chance: ${usd(bMin)} .. ${usd(bMax)} (max deviation from ${usd(BANKROLL)}: ${(dev * 100).toFixed(3)}%)`);
console.log(`  multiplier held at 0.999/win_chance: ${usd(aMin)} .. ${usd(aMax)}`);
console.log(`  potential profit at the top of each range's 0.1% tier (at its lower bound, 0.999 price): ${usd(p1Min)} .. ${usd(p1Max)}`);

// ── Example rows ─────────────────────────────────────────────────────────────
const rangeOf = v => ranges.find(r => r.key <= v && v <= r.to);
function row(r) {
  const one = r.tiers.find(t => units(t.house_edge) === units('0.01'));
  const top = r.tiers[r.tiers.length - 1];
  return `range ${r.key}..${r.to}: 0.1% tier up to ${usd(r.tiers[0].max_bet)}; `
    + (one ? `1.0% tier from ${usd(one.min_bet)} (min_bet ${one.min_bet}); ` : 'no 1.0% tier; ')
    + `max bet ${usd(top.max_bet)} at ${pct(top.house_edge)}`;
}
console.log('\nExample rows, by target (range holding 10000 − target):');
for (const t of [9998, 9900, 9800, 9700, 9000, 5000, 1000, 100, 2]) {
  console.log(`  target ${t} (win chance ${((10000 - t) / RANGE * 100).toFixed(4)}%): ${row(rangeOf(10000 - t))}`);
}
console.log('Rows by range lower bound:');
for (const k of [2, 101, 1001, 5001, 9001, 9901]) {
  console.log(`  key ${k} (win chance ${(k / RANGE * 100).toFixed(4)}%): ${row(ranges.find(r => r.key === k))}`);
}

// ── The captured bets ────────────────────────────────────────────────────────
const bets = ds.bets;
let tier1 = 0, onBoundary = 0, outside = 0, edgeIsTier = 0, worst = null;
const edges = new Map(), byPhase = new Map();
for (const b of bets) {
  const t = b.request.target, s = units(b.request.amount);
  const r = rangeOf(10000 - t);
  if (!r) { outside++; continue; }
  const idx = r.tiers.findIndex(x => s <= units(x.max_bet));
  if (r.tiers.some(x => s === units(x.max_bet))) onBoundary++;
  if (idx === 0) tier1++;
  const ee = b.response.effective_edge;
  edges.set(ee, (edges.get(ee) || 0) + 1);
  if (idx >= 0 && Number(ee) === Number(r.tiers[idx].house_edge) * 100) edgeIsTier++;
  const ratio = Number(s) / Number(units(r.tiers[0].max_bet));
  if (worst && ratio === worst.ratio) worst.ties++;
  if (!worst || ratio > worst.ratio) worst = { ratio, ties: 1, id: b.response.id, phase: b.phase, t, amount: b.request.amount, cap: r.tiers[0].max_bet, r };
  const p = byPhase.get(b.phase) || { n: 0, tier1: 0 }; p.n++; if (idx === 0) p.tier1++; byPhase.set(b.phase, p);
}
console.log(`\nCaptured bets (${DATASET}, sha256 matches): ${bets.length}`);
console.log(`  outside every range: ${outside}; in their range's 0.1% tier of E14: ${tier1} / ${bets.length} `
  + `(${[...byPhase].map(([k, p]) => `${k} ${p.tier1}/${p.n}`).join(', ')}); stakes equal to a tier boundary: ${onBoundary}`);
console.log(`  served effective_edge values (bet-time response): ${[...edges].map(([e, c]) => `${e}×${c}`).join(', ')}; `
  + `equal to 100 × the E14 tier edge: ${edgeIsTier} / ${bets.length}`);
const worstProfit = Number(worst.amount) * (0.999 * RANGE / (10000 - worst.t) - 1);
const capProfit = Number(worst.cap) * (0.999 * RANGE / (10000 - worst.t) - 1);
console.log(`  closest to its tier ceiling: ${worst.ties} bet(s), first ${worst.id} (phase ${worst.phase}), $${worst.amount} at target ${worst.t} `
  + `(potential profit ${usd(worstProfit)}), against ${usd(worst.cap)} (range ${worst.r.key}..${worst.r.to}; potential profit `
  + `${usd(capProfit)} at target ${worst.t}), ${(worst.ratio * 100).toFixed(2)}% of the 0.1% tier`);
console.log('  E14 is dated 2026-10-05 and the capture 2026-04-11: this is where the bets would fall under E14,');
console.log('  not a record of the config in force when they were placed.');
