/**
 * Step 17's false-alarm rate on a fair game, by a calibrated simulation (src/false-alarm.ts,
 * PASS2_FALSE_ALARM, is this script's declared output).
 *
 *   npm run false-alarm:pass2          replicates and seed as declared; prints the rate and whether
 *                                      it equals the declaration
 *   npm run false-alarm:pass2 -- 100000   a quicker run at another replicate count
 *
 * THE RULE, AS STEP 17 APPLIES IT. Every revealed epoch's early window is nonces 0…49, each slot at
 * the target the casino served at that nonce (a nonce the capture missed takes the previous served
 * target, exactly as Step 17 and src/simulate.ts fill it). A slot returns mult(t) with probability
 * p(t) = (10000 − t)/10001 on a fair game. The aggregate return S over the 6,700 slots is standardized
 * by its exact mean and variance and the step FAILS when the one-sided normal lower-tail p of that z,
 * computed with the step's own normalLowerTailP, is below SIM_PASS2_ALPHA. So the step fails exactly
 * when S < c for the c found here by bisection on that same function.
 *
 * THE SIMULATION. S = F + A. F is the return of the slots served at a target 100 or more times (here
 * 1,000 slots at 9,800 and 700 at 9,700); its distribution is computed exactly from the two binomial
 * win counts. A, the other 5,000 slots, is simulated with a seeded xoshiro128** generator. Each
 * replicate contributes the exact P(F < c − A), and the rate is their mean (conditioned Monte Carlo);
 * the standard error is that of the mean.
 */

import { loadDataset, buildSeedMap, groupByHash } from './loader';
import { theoreticalWinChance, theoreticalMultiplier } from './rng';
import { normalLowerTailP, logGamma } from './stats';
import { SIM_PASS2_EARLY_WINDOW, SIM_PASS2_ALPHA } from './sim-config';
import { PASS2_FALSE_ALARM } from './false-alarm';

const REPLICATES = Number(process.argv[2] ?? PASS2_FALSE_ALARM.replicates);
const SEED = PASS2_FALSE_ALARM.seed;
const FIXED_MIN_SLOTS = 100;

// ── The served early-window slots, built as Step 17 builds them ─────────────────────────────────
const ds = loadDataset();
const seedMap = buildSeedMap(ds.seeds);
const byHash = groupByHash(ds.bets);
const W = SIM_PASS2_EARLY_WINDOW;
const slotTargets: number[] = [];
for (const [hash] of seedMap) {
  const epochBets = (byHash.get(hash) ?? []).slice().sort((a, b) => a.response.nonce - b.response.nonce);
  if (epochBets.length === 0) continue;
  const served: number[] = new Array(W);
  for (const b of epochBets) if (b.response.nonce < W) served[b.response.nonce] = b.request.target;
  let lastSeen = epochBets[0].request.target;
  for (let i = 0; i < W; i++) { if (served[i] === undefined) served[i] = lastSeen; else lastSeen = served[i]; }
  slotTargets.push(...served);
}

let E = 0, V = 0;
const perTarget = new Map<number, number>();
for (const t of slotTargets) {
  const p = theoreticalWinChance(t), m = theoreticalMultiplier(t);
  E += p * m; V += p * (1 - p) * m * m;
  perTarget.set(t, (perTarget.get(t) ?? 0) + 1);
}
const sd = Math.sqrt(V);

// ── The rule's threshold c: normalLowerTailP((c − E)/sd) = alpha, by bisection ─────────────────────
let zLo = -10, zHi = 0;
for (let i = 0; i < 200; i++) {
  const mid = (zLo + zHi) / 2;
  if (normalLowerTailP(mid) < SIM_PASS2_ALPHA) zLo = mid; else zHi = mid;
}
const c = E + zHi * sd;   // S < c ⇔ the step's p < alpha

// ── F: exact distribution of the fixed-target slots ──────────────────────────────────────────────
const fixed = [...perTarget.entries()].filter(([, n]) => n >= FIXED_MIN_SLOTS).sort((a, b) => a[0] - b[0]);
const rest = slotTargets.filter(t => (perTarget.get(t) ?? 0) < FIXED_MIN_SLOTS);
const pmf = (n: number, p: number): number[] => {
  const out: number[] = [];
  for (let k = 0; k <= n; k++) out.push(Math.exp(logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1) + k * Math.log(p) + (n - k) * Math.log1p(-p)));
  return out;
};
let support: Array<{ v: number; pr: number }> = [{ v: 0, pr: 1 }];
for (const [t, n] of fixed) {
  const m = theoreticalMultiplier(t), f = pmf(n, theoreticalWinChance(t));
  const next: Array<{ v: number; pr: number }> = [];
  for (const s of support) for (let k = 0; k <= n; k++) {
    const pr = s.pr * f[k];
    if (pr > 1e-300) next.push({ v: s.v + k * m, pr });
  }
  support = next;
}
support.sort((a, b) => a.v - b.v);
const vals = Float64Array.from(support.map(s => s.v));
const cum = new Float64Array(vals.length);
{ let acc = 0; for (let i = 0; i < vals.length; i++) { acc += support[i].pr; cum[i] = acc; } }
/** P(F < x). */
const fixedBelow = (x: number): number => {
  let lo = 0, hi = vals.length;           // first index with vals[i] >= x
  while (lo < hi) { const mid = (lo + hi) >> 1; if (vals[mid] < x) lo = mid + 1; else hi = mid; }
  return lo === 0 ? 0 : cum[lo - 1];
};

// ── A: the other slots, simulated (xoshiro128**, seeded through splitmix32) ──────────────────────
let sm = SEED >>> 0;
const splitmix32 = (): number => {
  sm = (sm + 0x9e3779b9) >>> 0;
  let z = sm;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
  return (z ^ (z >>> 16)) >>> 0;
};
let s0 = splitmix32(), s1 = splitmix32(), s2 = splitmix32(), s3 = splitmix32();
const rotl = (x: number, k: number): number => ((x << k) | (x >>> (32 - k))) >>> 0;
const next32 = (): number => {
  const r = Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0;
  const t = (s1 << 9) >>> 0;
  s2 = (s2 ^ s0) >>> 0; s3 = (s3 ^ s1) >>> 0; s1 = (s1 ^ s2) >>> 0; s0 = (s0 ^ s3) >>> 0;
  s2 = (s2 ^ t) >>> 0; s3 = rotl(s3, 11);
  return r;
};
const thr = Float64Array.from(rest.map(t => theoreticalWinChance(t) * 4294967296));   // win iff u32 < p·2^32
const mul = Float64Array.from(rest.map(t => theoreticalMultiplier(t)));

let sum = 0, sumSq = 0;
const t0 = Date.now();
for (let r = 0; r < REPLICATES; r++) {
  let a = 0;
  for (let i = 0; i < thr.length; i++) if (next32() < thr[i]) a += mul[i];
  const f = fixedBelow(c - a);
  sum += f; sumSq += f * f;
}
const rate = sum / REPLICATES;
const se = Math.sqrt(Math.max(0, sumSq / REPLICATES - rate * rate) / REPLICATES);
const rate4 = Number(rate.toPrecision(4)), se2 = Number(se.toPrecision(2));

console.log(`Step 17 false-alarm rate on a fair game (one-sided normal lower-tail p < ${SIM_PASS2_ALPHA} on the served early-window return)`);
console.log(`  slots ${slotTargets.length} (${fixed.map(([t, n]) => `${n} at target ${t}`).join(', ')} exact; ${rest.length} simulated)`);
console.log(`  exact mean ${E.toFixed(6)}, sd ${sd.toFixed(6)}; the step fails when the return is below ${c.toFixed(6)}`);
console.log(`  replicates ${REPLICATES.toLocaleString('en-US')}, seed ${SEED}, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
console.log(`  rate ${rate4} ± ${se2} (standard error; nominal ${SIM_PASS2_ALPHA})`);
const matches = REPLICATES === PASS2_FALSE_ALARM.replicates && rate4 === PASS2_FALSE_ALARM.rate && se2 === PASS2_FALSE_ALARM.standardError;
console.log(`  declared in src/false-alarm.ts: ${PASS2_FALSE_ALARM.rate} ± ${PASS2_FALSE_ALARM.standardError} at ${PASS2_FALSE_ALARM.replicates.toLocaleString('en-US')} replicates — ${matches ? 'MATCHES' : 'DIFFERS'}`);
if (REPLICATES === PASS2_FALSE_ALARM.replicates && !matches) process.exitCode = 1;
