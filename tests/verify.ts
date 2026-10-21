/**
 * Dice audit verification suite — 21 scored steps + 5 informational items.
 * Run: npm run verify
 * Expected: 20 PASS + 1 capture-origin FLAG (Step 4, verdict-neutral), verdict PROVABLY FAIR —
 * Full Pass, exit 0.
 */

import * as fs   from 'fs';
import * as path from 'path';

import { loadDataset, checkDatasetHash, buildSeedMap, groupByHash } from '../src/loader';
import type { VerifyContext, InfoItem, StepResult }     from './steps/context';
import { step }                                         from './steps/context';

import * as commitment  from './steps/commitment';
import * as determinism from './steps/determinism';
import * as payouts     from './steps/payouts';
import * as statistical from './steps/statistical';
import * as dataset     from './steps/dataset';
import * as simulation  from './steps/simulation';
import * as coverage    from './steps/coverage';
import * as bias        from './steps/bias';
import * as monotonicity from './steps/monotonicity';
import * as liveFit     from './steps/live-fit';
import { fieldDiff, beyondTolerance, maxima, DIFF_ATOL, DIFF_RTOL } from '../src/diff';
import { labelFor, profileCoverageBlock } from '../src/profile-map';
import { runRtpClaimGate, RTP_CLAIM_STEP } from '../src/rtp-settings';
import { rtpClaimVerdict, RTP_FIGURE_OVERSTATED, RTP_FIGURE_OVERSTATED_EXIT } from '../src/rtp-claim';

// ── Pre-flight: dataset hash ───────────────────────────────────────────────────

const hashCheck = checkDatasetHash();
console.log('\n  Dataset hash check:');
console.log(`    Expected: ${hashCheck.expected}`);
console.log(`    Actual:   ${hashCheck.actual}`);
console.log(`    Status:   ${hashCheck.match ? 'MATCH ✓' : 'MISMATCH ✗ — abort'}\n`);
if (!hashCheck.match) { process.exit(1); }

// ── Setup ─────────────────────────────────────────────────────────────────────

const ds      = loadDataset();
const seedMap = buildSeedMap(ds.seeds);

const bets   = ds.bets;
const seeds  = ds.seeds;
const phaseA = bets.filter(b => b.phase === 'A');
const phaseB = bets.filter(b => b.phase === 'B');
const phaseC = bets.filter(b => b.phase === 'C');
const phaseD = bets.filter(b => b.phase === 'D');

const outputsDir = path.join(__dirname, '../outputs');

console.log('══════════════════════════════════════════════════════════');
console.log('  DICE AUDIT — VERIFICATION SUITE');
console.log('══════════════════════════════════════════════════════════');
console.log(`  Dataset: ${bets.length} bets  |  Seeds: ${seeds.length}`);
console.log(`  Phase A: ${phaseA.length}  Phase B: ${phaseB.length}  Phase C: ${phaseC.length}  Phase D: ${phaseD.length}\n`);

// ── Build context ─────────────────────────────────────────────────────────────

const byHash = groupByHash(bets);

const ctx: VerifyContext = {
  bets, seeds, seedMap, byHash,
  phaseA, phaseB, phaseC, phaseD,
  outputsDir,
  step5Mismatches: 0,
  step5Skipped:    0,
  chiResultsLog:   [],
};

// ── Run scored steps ─────────────────────────────────────────────────────────

// FAIL CLOSED, NEVER CRASH (since v1.2.0). src/rng.ts, rebuilt from docs/ALGORITHM.md, THROWS on an input
// outside the spec's domain (a target whose winning-outcome count has no scaling_edge band, a malformed
// seed, a negative nonce) where the v1.1.0 port returned a number. A served value outside that domain
// is a finding, so a step module that throws on it FAILs each step it carries, with the error, and the
// run continues to a verdict — it does not die before printing one (mutation M18 drives a target out
// of range and requires Step 18 to report it).
function guarded(steps: readonly number[], run: () => StepResult[]): StepResult[] {
  try { return run(); } catch (e) {
    const why = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    return steps.map(n => step(n, 'Step module threw', 'FAIL',
      `the step could not complete on this data — ${why} (an input outside the declared domain FAILs, it is never skipped)`,
      { threw: why }));
  }
}

const results = [
  ...guarded([1, 2, 3, 4], () => commitment.run(ctx)),     // Steps  1– 4
  ...guarded([5, 6], () => determinism.run(ctx)),          // Steps  5– 6
  ...guarded([7, 8, 9, 10], () => payouts.run(ctx)),       // Steps  7–10
  ...guarded([11, 12, 13, 14, 15], () => dataset.run(ctx)), // Steps 11–15
  ...guarded([16, 17], () => simulation.run(ctx)),         // Steps 16–17
  ...guarded([18], () => coverage.run(ctx)),               // Step  18
  ...guarded([19], () => bias.run(ctx)),                   // Step  19
  ...guarded([20], () => monotonicity.run(ctx)),           // Step  20
  ...guarded([21], () => liveFit.run(ctx)),                // Step  21
];

// ── RTP-CLAIM rule (1.2.0, Methodology v1.1; 1.0.0 agreed 2026-09-29) ───────────
// The per-setting exact RTP table held to the published claim (src/rtp-settings.ts). The package
// switch RTP_CLAIM_RULE_ENFORCED is true (D3, 2026-10-14). Status OVERSTATED (a house-side miss) is
// scored on the step carrying DICE-19 as an operator-origin FLAG (the profile's policy) and the
// verdict becomes RTP FIGURE OVERSTATED, exit 5 (rtpClaimVerdict) — never NOT PROVABLY FAIR: the
// draws themselves pass. Status FAIL means the committed table no longer equals this run (or its
// pin): a reproduction failure, exit 1, whether or not the rule is enforced; no step moves for it.
const rtpClaim = runRtpClaimGate();
console.log('');
for (const line of rtpClaim.lines) console.log(`  ${line}`);
const rtpOverstated = rtpClaim.status === 'OVERSTATED';
if (rtpOverstated) {
  const s = results.find(r => r.step === RTP_CLAIM_STEP);
  if (s && s.status !== 'FAIL') {
    s.status = 'FLAG'; s.origin = 'operator';
    s.detail += ` — ${RTP_FIGURE_OVERSTATED} (RTP-CLAIM enforced): ${rtpClaim.result.minimalFix}`;
    // The step printed its own line when it ran, before this rule was scored. Print it again at the
    // status it is now counted at, so the console agrees with the summary and the emitted record.
    console.log(`  [FLAG] Step ${s.step} — ${s.name} (re-scored: RTP-CLAIM enforced, ${RTP_FIGURE_OVERSTATED})`);
    console.log(`         ${s.detail}`);
  }
}

// ── Run informational items (live-bet stats — underpowered, not scored) ──────

const infoItems: InfoItem[] = statistical.run(ctx);

// ── Summary ───────────────────────────────────────────────────────────────────

const passed   = results.filter(r => r.status === 'PASS').length;
const flags    = results.filter(r => r.status === 'FLAG').length;
const hardFail = results.filter(r => r.status === 'FAIL').length;
// INFO (profile policy INFORMATIONAL — the live-sample fit, adopted 2026-09-29): reported, never counted
// as a flag, never enters the verdict or the exit code.
const informational = results.filter(r => r.status === 'INFO').length;
// A capture-origin FLAG (an auditor-side capture retry reconstructed via commit-reveal) is
// disclosed but verdict-neutral; only an operator-origin FLAG downgrades to Conditional Pass.
// Rule adopted 2026-09-22 (QA on PLINKO-04, ported to Dice for DICE-04): not a PASS, but
// not against the verdict.
const captureFlags  = results.filter(r => r.status === 'FLAG' && r.origin === 'capture').length;
const operatorFlags = results.filter(r => r.status === 'FLAG' && r.origin !== 'capture').length;
// Ranked by the rule's rtpClaimVerdict: a failed draw check (NOT PROVABLY FAIR) > RTP FIGURE
// OVERSTATED > Conditional Pass > Full Pass. This suite has no INCOMPLETE state.
const ruled    = rtpClaimVerdict({ fails: hardFail, complete: true, overstated: rtpOverstated, opFlags: operatorFlags });
const verdict  = ruled.verdict;

// Display scored results
for (const s of results) {
  if (s.status !== 'PASS') {
    // Already printed by step() — just ensure failures are visible in summary
  }
}

// Display informational items
if (infoItems.length > 0) {
  console.log('');
  console.log('  ┌── Informational Context (not scored) ──');
  for (const item of infoItems) console.log(`  │ ${item.label}: ${item.detail}`);
  console.log('  └──');
}

console.log('\n══════════════════════════════════════════════════════════');
console.log('  RESULTS SUMMARY');
console.log('══════════════════════════════════════════════════════════');
console.log(`  Passed:     ${passed}/${results.length}`);
console.log(`  Hard fails: ${hardFail}`);
console.log(`  Flags:      ${flags} (${operatorFlags} verdict-affecting, ${captureFlags} capture-origin / verdict-neutral)`);
if (informational > 0) console.log(`  Informational deviations: ${informational} (reported, not counted, verdict unchanged)`);
console.log(`\n  VERDICT: ${verdict}`);
console.log('══════════════════════════════════════════════════════════\n');

// ── Write output ──────────────────────────────────────────────────────────────

// ARTIFACTS OF RECORD CARRY NO RUN METADATA (profile DICE-27, rules.reproduction). The three
// objects below used to carry `generatedAt`, so every emission differed from the last in bytes and
// none could be pinned. They now carry only what the run decided: a regeneration that changes no
// figure reproduces the pinned bytes (src/artifact-pins.ts, checked by Step 12). The runtime is
// recorded where it belongs — outputs/run/diff.json.
const verificationOutput = {
  totalBets:   bets.length,
  totalSeeds:  seeds.length,
  // Each scored step says which ProvablyFair.org Dice profile check it implements, so the
  // conformance matrix is DERIVED from this artifact rather than written by hand and left to go
  // stale. The label is attached to the emitted record only: src/profile-map.ts cannot change
  // what any step asserts, and a step that answers no profile check says so explicitly.
  steps:       results.map(r => ({ ...r, ...labelFor(r.step) })),
  profileCoverage: profileCoverageBlock(),
  info:        infoItems,
  summary:     { passed, flags, operatorFlags, captureFlags, hardFail, verdict },
};

const determinismOutput = {
  verified:    bets.length - ctx.step5Skipped,
  mismatches:  ctx.step5Mismatches,
  skipped:     ctx.step5Skipped,
};

const chiSquaredOutput = {
  groups:      ctx.chiResultsLog,
};

// A VERIFICATION RUN MUST NOT REWRITE THE ARTIFACT IT SCORES. A run that disagrees with the
// committed evidence would otherwise destroy the evidence of the disagreement, and the next run
// would compare the repo against what the failing run had just written. This run writes under
// outputs/run/ — gitignored, a run record rather than audit evidence. The committed copies in
// outputs/ are refreshed only by PF_EMIT=1.
const PF_EMIT = process.env.PF_EMIT === '1';
const RUN_DIR = path.join(outputsDir, 'run');
const RESULTS_DIR = PF_EMIT ? outputsDir : RUN_DIR;
fs.mkdirSync(outputsDir, { recursive: true });
fs.mkdirSync(RUN_DIR, { recursive: true });

fs.writeFileSync(path.join(RESULTS_DIR, 'verification-results.json'), JSON.stringify(verificationOutput, null, 2));
fs.writeFileSync(path.join(RESULTS_DIR, 'determinism-log.json'), JSON.stringify(determinismOutput, null, 2));
fs.writeFileSync(path.join(RESULTS_DIR, 'chi-squared-results.json'), JSON.stringify(chiSquaredOutput, null, 2));

const WROTE_TO = PF_EMIT ? 'outputs' : 'outputs/run';
console.log(`  Outputs written to: ${WROTE_TO}/verification-results.json`);
console.log(`  Outputs written to: ${WROTE_TO}/determinism-log.json`);
console.log(`  Outputs written to: ${WROTE_TO}/chi-squared-results.json`);
if (!PF_EMIT) console.log('  Committed artifacts NOT modified.');

// ── Reproduction gate ─────────────────────────────────────────────────────────
// THE GATE IS "BEYOND TOLERANCE", NOT "ANY FIELD". Byte identity is the right bar for exact
// content — the dataset, hash-guarded above. It is the wrong bar for a DERIVED statistic:
// recomputed on other hardware a floating-point figure can move by a unit in the last place.
// Scoring that as a disagreement trains a reader to ignore the diff, which is the one outcome
// that makes it useless. The bound is declared in src/diff.ts, far below the precision of any
// figure this audit publishes; outside it is a DIFFERENT result, and the run exits 1.
let reproductionFailures = 0;
if (!PF_EMIT) {
  const readJsonOrNull = (p: string): unknown => {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
  };
  const targets: { file: string; fresh: unknown }[] = [
    { file: 'verification-results.json', fresh: verificationOutput },
    { file: 'determinism-log.json',      fresh: determinismOutput },
    { file: 'chi-squared-results.json',  fresh: chiSquaredOutput },
  ];
  // test:full regenerates the simulation census into outputs/run/ (via `npm run simulate:run`); when
  // it is present, field-diff it against the pinned committed artifact so a regeneration that drifts
  // beyond the reproduction tolerance is caught. Plain `npm test` does not regenerate it, so there
  // is nothing to diff and the pinned census is scored as-is by Steps 16/17.
  const runSim = readJsonOrNull(path.join(RUN_DIR, 'simulation-results.json'));
  if (runSim !== null) targets.push({ file: 'simulation-results.json', fresh: runSim });
  const perFile = targets.map(t => {
    const committed = readJsonOrNull(path.join(outputsDir, t.file));
    // No field is excluded: run metadata is ABSENT from every artifact, not skipped by the diff,
    // so a timestamp that crept back into one would show up here as a difference.
    const diffs = fieldDiff(committed, t.fresh, []);
    return { file: t.file, readable: committed !== null, diffs, real: beyondTolerance(diffs) };
  });
  const allDiffs  = perFile.flatMap(p => p.diffs);
  const realTotal = perFile.reduce((n, p) => n + p.real.length, 0);
  const gap       = maxima(allDiffs);

  fs.writeFileSync(path.join(RUN_DIR, 'diff.json'), JSON.stringify({
    runtime: process.versions.node,
    verdict,
    tolerance: { atol: DIFF_ATOL, rtol: DIFF_RTOL, rule: '|a-b| <= atol + rtol*max(|a|,|b|); two distinct integers never agree' },
    reproduced: realTotal === 0,
    beyondToleranceCount: realTotal,
    withinToleranceCount: allDiffs.length - realTotal,
    largestGap: gap,
    note: 'Field-level diff between the COMMITTED artifacts and THIS RUN. No field is excluded: the '
      + 'artifacts of record carry no run metadata. Entries marked `withinTolerance` are the '
      + 'same result computed on different hardware and are recorded, not scored. Any entry NOT '
      + 'so marked means this run disagrees with the committed evidence — investigate it; do not '
      + 're-run until it goes away, and do not regenerate the committed artifact to make it go away.',
    files: perFile.map(p => ({ file: `outputs/${p.file}`, committedReadable: p.readable, differences: p.diffs })),
  }, null, 2));

  console.log(`  Reproduction vs the committed artifacts on Node ${process.versions.node}: `
    + `${realTotal === 0 ? 'REPRODUCED' : `${realTotal} field(s) BEYOND TOLERANCE`}`
    + `${allDiffs.length - realTotal > 0 ? ` (${allDiffs.length - realTotal} within tolerance` + (gap ? `, largest ${gap.absDiff.toExponential(2)} at ${gap.path}` : '') + ')' : ''}`);
  console.log(`  Diff written to: outputs/run/diff.json`);
  if (realTotal > 0) {
    console.log('  ⚠ THIS RUN DISAGREES WITH THE COMMITTED EVIDENCE:');
    for (const p of perFile) {
      if (!p.readable) { console.log(`      outputs/${p.file}: committed copy absent or unreadable`); continue; }
      for (const d of p.real.slice(0, 4)) {
        console.log(`      ${p.file} ${d.path}: committed ${JSON.stringify(d.committed)} vs this run ${JSON.stringify(d.thisRun)}`);
      }
    }
  }
  reproductionFailures = realTotal;
} else {
  console.log('  REPORT GENERATION (PF_EMIT=1): the committed artifacts in outputs/ were rewritten.');
}

// ── Exit contract ─────────────────────────────────────────────────────────────
// FAIL -> 1, RTP FIGURE OVERSTATED -> 5, FLAG -> 2, otherwise 0, so an automated caller reads the
// verdict from the exit status. A reproduction beyond tolerance is a FAIL, not a warning: a gate
// that only prints is not a gate.
// A capture-origin FLAG is disclosed but verdict-neutral: it does not move the exit off 0, so
// `npm test` stays green on a Full Pass that carries only capture limitations.
if (hardFail > 0 || reproductionFailures > 0 || !rtpClaim.tableMatches) process.exit(1);
if (ruled.exit === RTP_FIGURE_OVERSTATED_EXIT) process.exit(RTP_FIGURE_OVERSTATED_EXIT);
if (operatorFlags > 0) process.exit(2);
