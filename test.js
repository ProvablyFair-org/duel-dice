/**
 * STANDALONE UNIT SUITE — generated, do not edit.
 *
 *     node test.js
 *
 * Runs the package's own unit tests with no `npm install` and no mocha. The test sources are
 * unchanged; `describe`/`it` are bound to Node's built-in `node:test` runner instead of mocha's.
 *
 * It is a BUILD PRODUCT of every unit-test file under `tests/` (the *Tests.ts spec set).
 * Rebuild with `audit-framework/tools/build-standalone-verifier.mjs <package> --tests`.
 *
 * Linked modules: 8
 */
'use strict';

var __nodeTest = require('node:test');
function __mochaCtx() {
  return { timeout: function () {}, slow: function () {}, retries: function () {} };
}
function __wrap(fn) {
  if (typeof fn !== 'function') return fn;
  return function () { return fn.call(__mochaCtx()); };
}
function __bind(name) {
  var orig = __nodeTest[name];
  var bound = function (desc, fn) { return orig(desc, __wrap(fn)); };
  // carry .skip / .only / .todo through so a suite can still disable a case
  for (var k in orig) { if (typeof orig[k] === 'function') bound[k] = orig[k]; }
  bound.skip = orig.skip; bound.only = orig.only; bound.todo = orig.todo;
  return bound;
}
// HOOKS NEED THE SHIM TOO, and leaving them out is not a cosmetic miss. mines' QA-01 suite calls
// this.timeout(600_000) inside a before(...) hook for a million-round replay. Unwrapped, that hook
// threw, Node cancelled every test in the suite, and the run reported "38 pass, 0 fail" while
// SEVEN tests had silently never executed — a green result over a hole. Caught 2026-09-11 by the
// unit-count parity check (mocha 45 vs standalone 38), which is the entire reason that check exists.
function __bindHook(name) {
  var orig = __nodeTest[name];
  return function (fn) { return orig(__wrap(fn)); };
}
globalThis.describe   = __bind('describe');
globalThis.it         = __bind('it');
globalThis.before     = __bindHook('before');
globalThis.after      = __bindHook('after');
globalThis.beforeEach = __bindHook('beforeEach');
globalThis.afterEach  = __bindHook('afterEach');


var __PF_ROOT__ = __dirname;
var __nodeRequire = require;
var __modules = {
  "src/diff.js": function (module, exports, require, __filename, __dirname) {
"use strict";
/**
 * Field-level diffs between a verification run and the committed artifacts it evaluated.
 *
 * tests/verify.ts uses this to decide whether a re-run of the Dice audit reproduces the
 * committed evidence, and writes the result to outputs/run/diff.json.
 *
 * Two questions are deliberately kept apart. The SHA-256 dataset guard asserts the identity of
 * the captured input — those bytes are the record, and byte equality is the right bar for them.
 * What this module answers is whether a RECOMPUTATION is the same result, which byte equality
 * cannot decide: the last bits of a derived floating-point statistic are a property of the
 * machine that computed them. Demanding byte identity of derived statistics makes "reproduce it
 * yourself" a claim no reader can satisfy; demanding nothing lets a genuinely different result
 * pass as noise.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.beyondTolerance = exports.DIFF_RTOL = exports.DIFF_ATOL = void 0;
exports.flattenLeaves = flattenLeaves;
exports.numbersAgree = numbersAgree;
exports.fieldDiff = fieldDiff;
exports.maxima = maxima;
/** Flatten a JSON value to `dotted.path` → leaf. Arrays index as `path[0]`. */
function flattenLeaves(value, prefix = '', out = new Map()) {
    if (value === null || typeof value !== 'object') {
        out.set(prefix, value);
        return out;
    }
    if (Array.isArray(value)) {
        if (value.length === 0)
            out.set(prefix, '<empty array>');
        value.forEach((v, i) => flattenLeaves(v, `${prefix}[${i}]`, out));
        return out;
    }
    const keys = Object.keys(value);
    if (keys.length === 0)
        out.set(prefix, '<empty object>');
    for (const k of keys)
        flattenLeaves(value[k], prefix ? `${prefix}.${k}` : k, out);
    return out;
}
/** The value as `JSON.stringify` would serialise it — `undefined` keys gone, dates as strings. */
const asWritten = (v) => JSON.parse(JSON.stringify(v ?? null));
/**
 * The reproduction tolerance.
 *
 * A pinned artifact asserts the identity of the committed EVIDENCE — its bytes and its SHA-256
 * are the record, and the hash guard in tests/verify.ts re-asserts them. What this bound governs
 * is a different question: whether a RECOMPUTATION on another machine is the same result. It is
 * not the same question, because the last bits of a derived floating-point statistic are
 * environment-dependent. Demanding byte identity of derived statistics would make "reproduce it
 * yourself" a claim no reader could ever satisfy, and demanding nothing would let a genuinely
 * different result pass as noise.
 *
 * The bound is 1e-14 absolute + 1e-12 relative — far below the precision of any figure this
 * audit publishes, and far above cross-runtime ULP drift.
 */
exports.DIFF_ATOL = 1e-14;
exports.DIFF_RTOL = 1e-12;
/**
 * Whether two numbers are the same result. Two DISTINCT integers never are: counts, populations,
 * step numbers and bet totals must match exactly, and this is the line that says so. Only an
 * integer PAIR is held to exact equality — an integer against a float is the cross-runtime case
 * (`0` on one machine, `5.55e-16` on another) and gets the tolerance, which is still tighter
 * than any distinct pair of integers could satisfy.
 */
function numbersAgree(a, b, atol = exports.DIFF_ATOL, rtol = exports.DIFF_RTOL) {
    if (Number.isNaN(a) || Number.isNaN(b))
        return Number.isNaN(a) && Number.isNaN(b);
    if (a === b)
        return true;
    if (!Number.isFinite(a) || !Number.isFinite(b))
        return false;
    if (Number.isInteger(a) && Number.isInteger(b))
        return false;
    return Math.abs(a - b) <= atol + rtol * Math.max(Math.abs(a), Math.abs(b));
}
/**
 * Every leaf on which `committed` and `thisRun` disagree, by path. `ignore` drops paths whose
 * dotted name matches exactly — used for the run timestamp, which differs by construction on
 * every run and would otherwise be the only entry in every diff.
 *
 * Numeric disagreements inside the tolerance are still REPORTED — the diff is a record of what
 * this run computed, and silently dropping them would hide drift that is creeping toward the
 * bound. They are marked `withinTolerance`, and it is `beyondTolerance()` below, not the length
 * of this array, that decides whether the run agrees with the committed evidence.
 */
function fieldDiff(committed, thisRun, ignore = [], tol = {}) {
    const atol = tol.atol ?? exports.DIFF_ATOL;
    const rtol = tol.rtol ?? exports.DIFF_RTOL;
    const a = flattenLeaves(committed);
    // Compare against what WOULD BE WRITTEN, not against the in-memory object. `JSON.stringify`
    // drops keys whose value is `undefined`, so an optional field left unset is absent from the
    // committed file but present-and-undefined in the live object — reported as a disagreement
    // between a file and itself. Round-tripping the fresh side removes that whole class.
    const b = flattenLeaves(asWritten(thisRun));
    const skip = new Set(ignore);
    const paths = [...new Set([...a.keys(), ...b.keys()])].sort();
    const out = [];
    for (const p of paths) {
        if (skip.has(p))
            continue;
        const inA = a.has(p), inB = b.has(p);
        const va = inA ? a.get(p) : '<absent>';
        const vb = inB ? b.get(p) : '<absent>';
        if (Object.is(va, vb))
            continue;
        if (typeof va === 'number' && typeof vb === 'number') {
            const absDiff = Math.abs(va - vb);
            const scale = Math.max(Math.abs(va), Math.abs(vb));
            out.push({
                path: p, committed: va, thisRun: vb, absDiff,
                relDiff: scale === 0 ? 0 : absDiff / scale,
                withinTolerance: numbersAgree(va, vb, atol, rtol),
            });
            continue;
        }
        out.push({ path: p, committed: va, thisRun: vb, withinTolerance: false });
    }
    return out;
}
/** The subset that is a real disagreement rather than cross-runtime float drift. */
const beyondTolerance = (diffs) => diffs.filter(d => !d.withinTolerance);
exports.beyondTolerance = beyondTolerance;
/** The largest gap seen on any numeric path, for the run record. `null` when there was none. */
function maxima(diffs) {
    let best = null;
    for (const d of diffs) {
        if (typeof d.absDiff !== 'number')
            continue;
        if (best === null || d.absDiff > best.absDiff)
            best = { path: d.path, absDiff: d.absDiff, relDiff: d.relDiff ?? 0 };
    }
    return best;
}

  },
  "src/loader.js": function (module, exports, require, __filename, __dirname) {
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_ODDS = exports.MIN_ODDS = exports.DECLARED_DIRECTION_MODES = exports.MIN_BETS_PER_STAKE_TIER = exports.EXPECTED_STAKE_TIERS = exports.MIN_BETS_PER_TARGET_BAND = exports.TARGET_BANDS = exports.TARGET_MAX = exports.TARGET_MIN = exports.EXPECTED_EPOCH_SIZE = exports.EXPECTED_EPOCHS = exports.EXPECTED_PHASE_BOUNDARY_SKIPS = exports.EXPECTED_SEED_TRANSITIONS = exports.EXPECTED_REVEALED_SEEDS = exports.EXPECTED_SEED_PHASES = exports.EXPECTED_PHASE_BETS = exports.EXPECTED_SEEDS = exports.EXPECTED_BETS = void 0;
exports.getDatasetPath = getDatasetPath;
exports.loadDataset = loadDataset;
exports.loadDatasetBuffer = loadDatasetBuffer;
exports.checkDatasetHash = checkDatasetHash;
exports.buildSeedMap = buildSeedMap;
exports.groupByHash = groupByHash;
exports.isWin = isWin;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const rng_1 = require("./rng");
const DATASET_PATH = path.join(__dirname, '../data/dice-master-6700bets.json');
const EXPECTED_HASH = '3550ffca07a6f7825f96cdd4e3d8c3cd57898b5b5238b9739753a754cff056d6';
// ── POPULATION OF RECORD ──────────────────────────────────────────────────────
// The capture plan stated as CODE, next to the dataset pin, so the scored steps have
// something to check the data against that the data does not control. A dataset that
// agrees with its own header proves nothing: delete bets, delete seeds, shrink every
// epoch and edit the header to match, and the file is still internally consistent —
// and it re-pins cleanly, because re-pinning is what a forger does. Anything scored
// against these numbers has to HARD_FAIL when they disagree.
exports.EXPECTED_BETS = 6700;
exports.EXPECTED_SEEDS = 138;
exports.EXPECTED_PHASE_BETS = Object.freeze({ A: 5000, B: 1000, C: 200, D: 500 });
exports.EXPECTED_SEED_PHASES = Object.freeze({ A: 101, B: 21, C: 5, D: 11 });
// EXPECTED_REVEALED_SEEDS counts seed ROWS that carry a plaintext field: every one of the 138 does,
// row 0 only because its plaintext (epoch 0's own seed) was copied from row 1 outside the capture
// script, which writes the first rotation with serverSeed null (MANIFEST.md#dataset-and-capture);
// no step hashes row 0's plaintext or replays a bet with it. For i ≥ 1, row i's
// plaintext reveals row i-1's commitment, so the rows reveal 134 commitments, one for every
// epoch with bets. The 4 rotations with no bets (seed rows 100, 121, 126, 137: three end-of-phase
// rotations and the final one) are never revealed. Of the 137 adjacent transitions, 3 cross a
// phase boundary, where the phase-start row repeats the previous phase's last revealed seed
// instead of revealing the end-of-phase rotation's, so 134 transitions are compared.
exports.EXPECTED_REVEALED_SEEDS = 138;
exports.EXPECTED_SEED_TRANSITIONS = 137;
exports.EXPECTED_PHASE_BOUNDARY_SKIPS = 3;
// Every epoch in this capture is a full 50 bets; there are 134 of them. Asserting the
// SIZE alone leaves epoch count free, so dropping whole epochs passes — both are pinned.
exports.EXPECTED_EPOCHS = 134;
exports.EXPECTED_EPOCH_SIZE = 50;
// Target is the configuration dimension, valid over 2…9998: the duel.com dice config (E14,
// scaling_edge) defines an edge only for 2…9998 winning outcomes, and src/rng.ts (rebuilt from
// docs/ALGORITHM.md §3.3) refuses a multiplier outside those bands. Until v1.2.0 this read 1…9999,
// which disagreed with the RTP claim table's 2–9998 (src/rtp-settings.ts). Phase A samples it at random,
// so the coverage question is whether the sampling actually spanned the range: the target
// space is split into ten 1000-wide bands and each must carry the floor below. The lowest
// band observed carries 404 bets (403 under the former 1…9999 bands), so a floor of 350 fails on a band cut to a token sample
// while leaving the honest capture passing.
exports.TARGET_MIN = 2;
exports.TARGET_MAX = 9998;
exports.TARGET_BANDS = 10;
exports.MIN_BETS_PER_TARGET_BAND = 350;
// ── DECLARED STAKE LEVELS & DIRECTION MODES (DICE-15 coverage) ─────────────────
// The capture plan exercises two stake levels: a $0.01 base stake (Phases A, B, D) and a $10
// elevated stake (Phase C, 1,000× the base) so that the payout path is exercised at size, not
// only the roll. Both levels must appear in the capture — a capture that dropped the elevated level
// leaves bet-size invariance untested — so each declared level carries a floor below, pinned here
// in code rather than described in prose. The constant names keep "TIER"; these are not Duel's
// edge tiers, and both levels are in its 0.1 % edge tier (MANIFEST.md#scaling-edge, DL-15).
exports.EXPECTED_STAKE_TIERS = Object.freeze([0.01, 10]);
exports.MIN_BETS_PER_STAKE_TIER = 100;
// Duel Dice offers two direction modes, "over" (win iff result > target) and "under" (a settled
// roll-under bet is shown in evidence/E10-bet-history.png). This capture and this verifier cover
// "over" only: the capture holds 0 under bets, and Step 8's win rule, Step 13's lattice
// enumeration and the multiplier formula are written for the over rule alone, so an "under" bet
// settled by the over rule would be scored wrong. DECLARED_DIRECTION_MODES is therefore the
// AUDITED mode set, not the set of modes the game offers. It is asserted against the capture's
// bet_type field in Step 18, so a mode the verifier is not written for cannot enter the dataset
// unnoticed. Roll-under is a declared limitation (DL-14 in MANIFEST.md).
exports.DECLARED_DIRECTION_MODES = Object.freeze(['over']);
// ── DECLARED ODDS BOUNDS (DICE-14) ────────────────────────────────────────────
// The multiplier is 0.999 / ((10000 − target) / 10001), a strictly INCREASING function of the
// target: a higher target means a lower win chance and a larger payout. So the two edges of the
// valid over-bet target band [TARGET_MIN, TARGET_MAX] give the declared min/max odds. A quoted
// multiplier outside [MIN_ODDS, MAX_ODDS] would mean a target outside the game's valid domain —
// disclosed as a FLAG (DICE-14 is FLAG policy). Derived here from the src constants above and the
// formula in src/rng.ts, never from the dataset, so the bound describes the game rather than the
// capture. MIN_ODDS = 0.999·10001/9998 ≈ 0.99930; MAX_ODDS = 0.999·10001/2 = 4995.4995.
exports.MIN_ODDS = (0, rng_1.theoreticalMultiplier)(exports.TARGET_MIN);
exports.MAX_ODDS = (0, rng_1.theoreticalMultiplier)(exports.TARGET_MAX);
function getDatasetPath() { return DATASET_PATH; }
function loadDataset() {
    const raw = fs.readFileSync(DATASET_PATH, 'utf-8');
    return JSON.parse(raw);
}
function loadDatasetBuffer() {
    return fs.readFileSync(DATASET_PATH);
}
function checkDatasetHash() {
    const raw = fs.readFileSync(DATASET_PATH);
    const actual = crypto.createHash('sha256').update(raw).digest('hex');
    return { expected: EXPECTED_HASH, actual, match: actual === EXPECTED_HASH };
}
/**
 * Build O(1) map: serverSeedHashed → serverSeed (plaintext).
 *
 * In the v3 dataset, seeds[N].seed.serverSeed is the PREVIOUS epoch's
 * revealed seed. The plaintext for seeds[N].serverSeedHashed is in
 * seeds[N+1].seed.serverSeed. We verify the hash before adding. seeds[0]'s own
 * plaintext was copied from seeds[1] outside the capture script and is not read here.
 */
function buildSeedMap(seeds) {
    const m = new Map();
    for (let i = 0; i < seeds.length - 1; i++) {
        const next = seeds[i + 1];
        if (next.seed.serverSeed) {
            const h = crypto.createHash('sha256')
                .update(Buffer.from(next.seed.serverSeed, 'hex'))
                .digest('hex');
            if (h === seeds[i].seed.serverSeedHashed) {
                m.set(seeds[i].seed.serverSeedHashed, next.seed.serverSeed);
            }
        }
    }
    return m;
}
/** Group bets by serverSeedHashed (epoch). */
function groupByHash(bets) {
    const m = new Map();
    for (const b of bets) {
        const hash = b.response.server_seed_hashed;
        const arr = m.get(hash) ?? [];
        arr.push(b);
        m.set(hash, arr);
    }
    return m;
}
/** Compute the "over" win condition deterministically from bet data. */
function isWin(bet) {
    return bet.response.result > bet.request.target;
}

  },
  "src/operator-verifier.js": function (module, exports, require, __filename, __dirname) {
"use strict";
/**
 * THE OPERATOR'S OWN VERIFIER CODE (profile DICE-09; Step 5, operator leg).
 *
 * Duel.com's Provably Fair → Verify page, with Dice selected, shows a JavaScript code panel behind an
 * "Expand" control (evidence/E03-fairness-verify-dice.png shows the page with the panel collapsed: only its
 * first lines are visible). That code is the operator's
 * published algorithm for Dice. Until 2026-09-25 the package said Duel ships no source (and no operator
 * verifier); that was wrong, and this file is the correction.
 *
 * ROLE (since 20 Oct 2026, v1.2.0). This file is a SECOND CHECK, not the source of src/rng.ts. src/rng.ts is
 * rebuilt from the written specification docs/ALGORITHM.md by an implementer who never opened Duel's code;
 * Duel's file is run here, byte for byte, to show that it agrees with that rebuild and with the served
 * rolls. Through v1.1.0 src/rng.ts was a port of this file and, from 25 Sep 2026, cited 12 of its lines;
 * the port and that citation table were removed on 20 Oct 2026.
 *
 * PROVENANCE. Copied by the auditor from duel.com → Provably Fair → Verify (Dice) → Expand → Copy on
 * 2026-09-25, and saved verbatim as evidence/verify-tab/duel-verify-tab-dice-2026-09-25.js
 * (2,678 bytes, 84 lines, file mtime 2026-09-25T13:36:08-03:00). The file is never edited. What this
 * does NOT establish: that the Verify button on the live page runs exactly the code its panel
 * displays, or that Duel's server runs it — the panel is what the operator publishes as its
 * algorithm, and that is what is pinned and executed here.
 *
 * WHAT THIS FILE DOES.
 *   1. PINS the SHA-256 of that file and of the runner that executes it (OPERATOR_VERIFIER_PINS).
 *      A file that does not hash to its pin FAILs Step 5 before anything runs.
 *   2. EXECUTES the file — not a re-typing of it — in a child Node process
 *      (verifier-parity/operator/run-operator-verifier.cjs; its header lists the whole harness
 *      surface: a function wrapper that hands the file Node's WebCrypto, TextEncoder and a console
 *      recorder, and the call to the file's own validateDiceResult). Not one character of the
 *      file is rewritten, even in memory. The child process is used because the file awaits
 *      WebCrypto and the suite is synchronous; spawnSync keeps it synchronous with no install.
 *      The file returns the roll as a STRING, ((value % RANGE) / 100).toString() (L66). It is mapped
 *      onto the integer 0..10000 lattice (rollUnits below) and compared by exact integer equality;
 *      the mapping itself is checked: the string must be exactly String(units / 100).
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.OPERATOR_RUNNER_TIMEOUT_MS = exports.OPERATOR_EXPECTED_LOGS = exports.OPERATOR_VERIFIER_PROVENANCE = exports.OPERATOR_VERIFIER_PINS = exports.OPERATOR_VERIFIER_RUNNER = exports.OPERATOR_VERIFIER_FILE = exports.PACKAGE_ROOT = void 0;
exports.runOperatorVerifier = runOperatorVerifier;
exports.rollUnits = rollUnits;
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
exports.PACKAGE_ROOT = path.join(__dirname, '..');
exports.OPERATOR_VERIFIER_FILE = 'evidence/verify-tab/duel-verify-tab-dice-2026-09-25.js';
exports.OPERATOR_VERIFIER_RUNNER = 'verifier-parity/operator/run-operator-verifier.cjs';
/** Package-relative path → SHA-256 of the exact bytes. */
exports.OPERATOR_VERIFIER_PINS = Object.freeze({
    'evidence/verify-tab/duel-verify-tab-dice-2026-09-25.js': '38b257c67d7a342754a201a4cf5220198807c9c1fffe0739b47f099e65950a5b',
    'verifier-parity/operator/run-operator-verifier.cjs': '9ec88b7bf98b798e50da5daae92c0ecde1dd864100815619992db22ce7441d82',
});
exports.OPERATOR_VERIFIER_PROVENANCE = Object.freeze({
    copiedBy: 'the auditor (ProvablyFair.org)',
    copiedOn: '2026-09-25',
    from: 'duel.com → Provably Fair → Verify, game Dice, Expand → Copy on the code panel (evidence/E03 shows the page, panel collapsed)',
    savedAs: exports.OPERATOR_VERIFIER_FILE,
    sha256: '38b257c67d7a342754a201a4cf5220198807c9c1fffe0739b47f099e65950a5b',
    bytes: 2678,
    lines: 84,
});
/** The only thing the file prints when it runs as shipped (its inputs are empty strings). */
exports.OPERATOR_EXPECTED_LOGS = Object.freeze([
    'Please provide valid serverSeed, clientSeed, and nonce (>=0) before running.',
]);
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
/**
 * HOW THE PINNED RUNNER IS STARTED (since 2026-09-25). Its stdin and stdout are temp FILES, not pipes, and
 * the run has a hard timeout. On 2026-09-25 a pipe-based run inside the Duel Blackjack mutation battery sat
 * for ~1 h 54 min with the runner idle at 0 % CPU and its pipe descriptors open, until it was killed by hand.
 * A file cannot fill, so the child never blocks on output nobody is reading; and a runner that does not exit
 * within OPERATOR_RUNNER_TIMEOUT_MS is SIGKILLed and reported as a failed run — the calling step FAILs, it
 * never waits. The runner itself (pinned) is unchanged.
 */
exports.OPERATOR_RUNNER_TIMEOUT_MS = 300000;
function runPinnedRunner(root, input) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-operator-runner-'));
    const inPath = path.join(dir, 'jobs.json');
    const outPath = path.join(dir, 'out.json');
    fs.writeFileSync(inPath, input);
    const inFd = fs.openSync(inPath, 'r');
    const outFd = fs.openSync(outPath, 'w');
    try {
        const r = (0, child_process_1.spawnSync)(process.execPath, [path.join(root, exports.OPERATOR_VERIFIER_RUNNER), path.join(root, exports.OPERATOR_VERIFIER_FILE)], {
            stdio: [inFd, outFd, 'pipe'],
            encoding: 'utf8',
            timeout: exports.OPERATOR_RUNNER_TIMEOUT_MS,
            killSignal: 'SIGKILL',
            maxBuffer: 1 << 24,
        });
        const timedOut = r.error?.code === 'ETIMEDOUT' || r.signal === 'SIGKILL';
        return {
            status: timedOut ? null : r.status,
            stdout: fs.readFileSync(outPath, 'utf8'),
            stderr: timedOut ? `runner killed after ${exports.OPERATOR_RUNNER_TIMEOUT_MS} ms (hard timeout)` : (r.stderr || ''),
            error: r.error,
        };
    }
    finally {
        fs.closeSync(inFd);
        fs.closeSync(outFd);
        fs.rmSync(dir, { recursive: true, force: true });
    }
}
/**
 * Hash the pinned files and, only if every one matches, run the operator's code on `rounds`.
 * Never throws: a failure is returned as `error` so the calling step reports a FAIL.
 */
function runOperatorVerifier(rounds, root = exports.PACKAGE_ROOT) {
    const files = Object.entries(exports.OPERATOR_VERIFIER_PINS).map(([file, pinned]) => {
        const p = path.join(root, file);
        const actual = fs.existsSync(p) ? sha256(fs.readFileSync(p)) : null;
        return { file, pinned, actual, match: actual === pinned };
    });
    const hashesMatch = files.every(f => f.match);
    if (!hashesMatch)
        return { files, hashesMatch, results: null, range: null, maxFair: null, logs: [], error: 'operator Verify-tab code or its runner does not match its pinned SHA-256' };
    const r = runPinnedRunner(root, JSON.stringify({ rounds }));
    if (r.status !== 0) {
        return { files, hashesMatch, results: null, range: null, maxFair: null, logs: [],
            error: `operator verifier runner exited ${r.status}: ${(r.stderr || String(r.error || '')).trim().slice(0, 400)}` };
    }
    try {
        const out = JSON.parse(r.stdout);
        const results = new Map();
        for (const x of out.results)
            results.set(String(x.id), typeof x.result === 'string' ? x.result : null);
        return { files, hashesMatch, results, range: out.range, maxFair: out.maxFair, logs: out.logs, error: null };
    }
    catch (e) {
        return { files, hashesMatch, results: null, range: null, maxFair: null, logs: [], error: `operator verifier output unreadable: ${e.message}` };
    }
}
/**
 * The operator's displayed roll → integer units on the 0..10000 lattice, or null when the string is
 * not exactly what ((units) / 100).toString() prints for an integer units in 0..10000.
 */
function rollUnits(s) {
    if (typeof s !== 'string')
        return null;
    const units = Math.round(Number(s) * 100);
    if (!Number.isInteger(units) || units < 0 || units > 10000)
        return null;
    return String(units / 100) === s ? units : null;
}

  },
  "src/rng.js": function (module, exports, require, __filename, __dirname) {
"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.GRID = exports.GRID_DP = exports.EDGE_DEN = exports.EDGE_NUM = exports.MAX_FAIR = exports.MAX_U32 = exports.RANGE = void 0;
exports.drawBiasBound = drawBiasBound;
exports.computeResultFromBuffer = computeResultFromBuffer;
exports.computeResult = computeResult;
exports.verifyHash = verifyHash;
exports.theoreticalWinChance = theoreticalWinChance;
exports.theoreticalMultiplier = theoreticalMultiplier;
exports.parseGridUnits = parseGridUnits;
exports.roundNearest = roundNearest;
exports.exactMultiplierUnits = exactMultiplierUnits;
exports.exactPayoutUnits = exactPayoutUnits;
const crypto_1 = require("crypto");
// ---------------------------------------------------------------------------
// Constants (§2 Step 2)
// ---------------------------------------------------------------------------
/** Number of distinct roll outcomes: the lattice 0, 1, ..., 10000 (§2 Step 2, N = 10001). */
exports.RANGE = 10001;
/** Largest unsigned 32-bit value, 2^32 - 1. */
exports.MAX_U32 = 0xffffffff;
/**
 * Rejection limit (§2 Step 2, LIMIT = floor(2^32 / N) * N = 4294959453).
 * A 4-byte chunk whose value is >= this is discarded so that every residue
 * mod RANGE is equally likely.
 */
exports.MAX_FAIR = Math.floor((exports.MAX_U32 + 1) / exports.RANGE) * exports.RANGE;
// ---------------------------------------------------------------------------
// Analytic bias report (§2 Step 2, rejection sampling)
// ---------------------------------------------------------------------------
function drawBiasBound() {
    // Work in BigInt so nothing here depends on float rounding.
    const range = BigInt(exports.RANGE);
    const maxFair = BigInt(exports.MAX_FAIR);
    const domain = BigInt(exports.MAX_U32) + 1n; // 2^32 distinct chunk values
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
        range: exports.RANGE,
        maxU32: exports.MAX_U32,
        maxFair: exports.MAX_FAIR,
        rangesAccepted: exports.MAX_FAIR / exports.RANGE,
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
function decodeServerSeed(serverSeed) {
    if (typeof serverSeed !== 'string' || !SEED_HEX.test(serverSeed)) {
        throw new TypeError('serverSeed must be 64 hexadecimal characters (§1.1)');
    }
    return Buffer.from(serverSeed, 'hex');
}
/** §1.1 / §2 Step 1: nonce is a non-negative integer, written in plain base 10. */
function nonceToDecimal(nonce) {
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
function computeResultFromBuffer(keyBuffer, clientSeed, nonce) {
    if (!Buffer.isBuffer(keyBuffer)) {
        throw new TypeError('keyBuffer must be a Buffer');
    }
    if (typeof clientSeed !== 'string') {
        throw new TypeError('clientSeed must be a string');
    }
    // §2 Step 1 (UTF-8 encoding: §6 O6).
    const message = Buffer.from(`${clientSeed}:${nonceToDecimal(nonce)}`, 'utf8');
    const digest = (0, crypto_1.createHmac)('sha256', keyBuffer).update(message).digest();
    // §2 Step 2: chunk offsets 0, 4, ..., 28.
    for (let i = 0; i + 4 <= digest.length; i += 4) {
        const v = digest.readUInt32BE(i);
        if (v < exports.MAX_FAIR) {
            return v % exports.RANGE;
        }
    }
    throw new Error('all 8 digest chunks rejected: continuation is unspecified (§6 O1)');
}
/** Same as computeResultFromBuffer, taking the server seed as published (64 hex chars, §1.1). */
function computeResult(serverSeed, clientSeed, nonce) {
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
function verifyHash(serverSeed, serverSeedHashed) {
    if (typeof serverSeed !== 'string' || !SEED_HEX.test(serverSeed))
        return false;
    if (typeof serverSeedHashed !== 'string' || !SEED_HEX.test(serverSeedHashed))
        return false;
    const commitment = (0, crypto_1.createHash)('sha256').update(Buffer.from(serverSeed, 'hex')).digest('hex');
    return commitment === serverSeedHashed.toLowerCase();
}
// ---------------------------------------------------------------------------
// Win condition, chance, multiplier for "over" bets (§3.1, §3.2, §3.4)
// ---------------------------------------------------------------------------
/** Lower and upper end of the CONFIG scaling_edge bands, in winning outcomes (§3.3). */
const MIN_BAND_COUNT = 2;
const MAX_BAND_COUNT = 9998;
/** §3.1 "over": win iff roll > target, so count = 10000 - target winning outcomes. */
function overCount(target) {
    if (!Number.isInteger(target) || target < 0 || target > exports.RANGE - 1) {
        throw new RangeError('target must be an integer in 0..10000 (§1.1)');
    }
    return exports.RANGE - 1 - target;
}
/**
 * The edge is only defined where a CONFIG band exists (§3.3: keys run 2..9998),
 * so the multiplier and payout refuse a target whose count falls outside that.
 */
function overCountInBands(target) {
    const count = overCount(target);
    if (count < MIN_BAND_COUNT || count > MAX_BAND_COUNT) {
        throw new RangeError(`count ${count} is outside the scaling_edge bands ${MIN_BAND_COUNT}..${MAX_BAND_COUNT} (§3.3)`);
    }
    return count;
}
/** §3.2: win_chance = count / 10001 (as a float; the 18-dp served form is checked via the grid functions). */
function theoreticalWinChance(target) {
    return overCount(target) / exports.RANGE;
}
/** §3.4: multiplier = (1 - e) * 10001 / count, audited tier e = 0.001 (as a float). */
function theoreticalMultiplier(target) {
    const count = overCountInBands(target);
    return (Number(exports.EDGE_NUM) * exports.RANGE) / (Number(exports.EDGE_DEN) * count);
}
// ---------------------------------------------------------------------------
// Exact arithmetic on the 1e-18 grid (§3.2, §3.4, §3.5)
// ---------------------------------------------------------------------------
/**
 * (1 - e) for the audited tier. §3.3: every captured bet used house_edge
 * "0.001", so 1 - e = 999/1000. Other tiers are not modelled (§6 O3).
 */
exports.EDGE_NUM = 999n;
exports.EDGE_DEN = 1000n;
/** Served values carry 18 decimal places (§3.2, §3.4, §3.5). */
exports.GRID_DP = 18;
exports.GRID = 10n ** 18n;
const PLAIN_DECIMAL = /^(\d+)(?:\.(\d{1,18}))?$/;
/**
 * Served decimal string -> integer count of 1e-18 units.
 * Accepts only a plain non-negative decimal: digits, optionally a dot and 1..18
 * fraction digits. No sign, exponent, whitespace or bare dot. Trailing zeros
 * may have been stripped by the server (§3.5), so the fraction is right-padded.
 * Anything that is not a string returns null (a JSON number may already have
 * lost precision).
 */
function parseGridUnits(s) {
    if (typeof s !== 'string')
        return null;
    const m = PLAIN_DECIMAL.exec(s);
    if (m === null)
        return null;
    const intPart = m[1];
    const fracPart = (m[2] ?? '').padEnd(exports.GRID_DP, '0');
    return BigInt(intPart) * exports.GRID + BigInt(fracPart);
}
/**
 * num/den rounded to the nearest integer, for num >= 0 and den > 0.
 * §3.2 / §3.4 / §3.5 say "rounded to nearest"; §6 O7 leaves the tie mode open
 * (half-up and half-even both fit every captured value). This rounds a tie
 * HALF-UP (away from zero, for these non-negative inputs) and reports tie=true
 * so the caller can see when the choice mattered.
 */
function roundNearest(num, den) {
    if (den <= 0n)
        throw new RangeError('den must be > 0');
    if (num < 0n)
        throw new RangeError('num must be >= 0');
    const q = num / den;
    const twiceRem = (num % den) * 2n;
    if (twiceRem > den)
        return { q: q + 1n, tie: false };
    if (twiceRem === den)
        return { q: q + 1n, tie: true };
    return { q, tie: false };
}
/** §3.4: exact (1 - e) * 10001 / count, rounded once to the 1e-18 grid. */
function exactMultiplierUnits(target) {
    const count = BigInt(overCountInBands(target));
    const r = roundNearest(exports.EDGE_NUM * BigInt(exports.RANGE) * exports.GRID, exports.EDGE_DEN * count);
    return { units: r.q, tie: r.tie };
}
/**
 * §3.5 (winning bet): amount * (1 - e) * 10001 / count from the EXACT
 * multiplier, rounded once to the 1e-18 grid. amountUnits is already in
 * 1e-18 units, so the result is too. A losing bet pays 0 (§3.5); deciding
 * win/loss is the caller's job (roll > target, §3.1).
 */
function exactPayoutUnits(amountUnits, target) {
    if (amountUnits < 0n)
        throw new RangeError('amountUnits must be >= 0');
    const count = BigInt(overCountInBands(target));
    const r = roundNearest(amountUnits * exports.EDGE_NUM * BigInt(exports.RANGE), exports.EDGE_DEN * count);
    return { units: r.q, tie: r.tie };
}

  },
  "src/types.js": function (module, exports, require, __filename, __dirname) {
"use strict";
/**
 * Duel.com Dice — type definitions.
 */
Object.defineProperty(exports, "__esModule", { value: true });

  },
  "tests/__standalone-entry.js": function (module, exports, require, __filename, __dirname) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("./dice/DiceTests");
require("./dice/RngSpecTests");

  },
  "tests/dice/DiceTests.js": function (module, exports, require, __filename, __dirname) {
"use strict";
/**
 * Unit tests — Duel.com Dice provably fair audit.
 * Run: npm test
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const assert = __importStar(require("assert"));
const rng_1 = require("../../src/rng");
const diff_1 = require("../../src/diff");
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
            const result = (0, rng_1.computeResult)(v.serverSeed, v.clientSeed, v.nonce);
            assert.strictEqual(result, v.expectedResult, `serverSeed=${v.serverSeed.slice(0, 8)}… nonce=${v.nonce}: expected ${v.expectedResult}, got ${result}`);
        }
    });
    it('computeResultFromBuffer matches computeResult for all test vectors', () => {
        for (const v of vectors) {
            const key = Buffer.from(v.serverSeed, 'hex');
            const fromBuf = (0, rng_1.computeResultFromBuffer)(key, v.clientSeed, v.nonce);
            const fromStr = (0, rng_1.computeResult)(v.serverSeed, v.clientSeed, v.nonce);
            assert.strictEqual(fromBuf, fromStr);
        }
    });
    it('HMAC key must be hex-decoded bytes — confirms correct encoding against known vectors', () => {
        // If key were UTF-8 string, results would differ
        for (const v of vectors) {
            const correct = (0, rng_1.computeResult)(v.serverSeed, v.clientSeed, v.nonce);
            const wrongKey = Buffer.from(v.serverSeed, 'utf-8');
            const wrong = (0, rng_1.computeResultFromBuffer)(wrongKey, v.clientSeed, v.nonce);
            assert.notStrictEqual(correct, wrong, `Vector with nonce=${v.nonce}: hex vs UTF-8 key should differ`);
        }
    });
    it('result is always an integer in range [0, 10000]', () => {
        for (const v of vectors) {
            const r = (0, rng_1.computeResult)(v.serverSeed, v.clientSeed, v.nonce);
            assert.ok(Number.isInteger(r) && r >= 0 && r <= 10000, `result=${r} out of range [0, 10000]`);
        }
    });
    it('win condition matches expected is_win for all 7 test vectors', () => {
        for (const v of vectors) {
            const result = (0, rng_1.computeResult)(v.serverSeed, v.clientSeed, v.nonce);
            const computed = result > v.target;
            assert.strictEqual(computed, v.isWin, `nonce=${v.nonce} target=${v.target} result=${result}: expected isWin=${v.isWin}`);
        }
    });
    it('verifyHash confirms commit-reveal integrity for all 7 known server seeds', () => {
        for (const v of vectors) {
            assert.ok((0, rng_1.verifyHash)(v.serverSeed, v.serverSeedHashed), `Hash mismatch for serverSeed=${v.serverSeed.slice(0, 8)}…`);
        }
    });
    it('verifyHash rejects a tampered server seed', () => {
        const v = vectors[0];
        const tampered = 'ff' + v.serverSeed.slice(2);
        assert.strictEqual((0, rng_1.verifyHash)(tampered, v.serverSeedHashed), false);
    });
    it('verifyHash rejects a tampered hash', () => {
        const v = vectors[0];
        const tamperedH = 'ff' + v.serverSeedHashed.slice(2);
        assert.strictEqual((0, rng_1.verifyHash)(v.serverSeed, tamperedH), false);
    });
    it('different nonces produce different results (nonce influence)', () => {
        const v = vectors[0];
        const r0 = (0, rng_1.computeResult)(v.serverSeed, v.clientSeed, 0);
        const r1 = (0, rng_1.computeResult)(v.serverSeed, v.clientSeed, 1);
        assert.notStrictEqual(r0, r1);
    });
    it('different client seeds produce different results', () => {
        const v = vectors[0];
        const r1 = (0, rng_1.computeResult)(v.serverSeed, 'seedAlpha', 0);
        const r2 = (0, rng_1.computeResult)(v.serverSeed, 'seedBeta', 0);
        assert.notStrictEqual(r1, r2);
    });
});
describe('Payout Formulas', () => {
    it('theoreticalWinChance matches live API values for all 7 test vectors', () => {
        // Independently computed: win_chance = (10000 - target) / 10001
        const expected = {
            9313: 687 / 10001,
            4253: 5747 / 10001,
            1831: 8169 / 10001,
            6990: 3010 / 10001,
            1709: 8291 / 10001,
            6025: 3975 / 10001,
            464: 9536 / 10001,
        };
        for (const [target, exp] of Object.entries(expected)) {
            const actual = (0, rng_1.theoreticalWinChance)(Number(target));
            assert.ok(Math.abs(actual - exp) < 1e-14, `target=${target}: expected ${exp}, got ${actual}`);
        }
    });
    it('theoreticalMultiplier = 0.999 / win_chance for all test vector targets', () => {
        for (const v of vectors) {
            const wc = (0, rng_1.theoreticalWinChance)(v.target);
            const expected = 0.999 / wc;
            const actual = (0, rng_1.theoreticalMultiplier)(v.target);
            assert.ok(Math.abs(actual - expected) < 1e-12, `target=${v.target}: expected ${expected}, got ${actual}`);
        }
    });
    it('RTP = win_chance × multiplier = 0.999 for all test vector targets', () => {
        for (const v of vectors) {
            const wc = (0, rng_1.theoreticalWinChance)(v.target);
            const mult = (0, rng_1.theoreticalMultiplier)(v.target);
            const rtp = wc * mult;
            assert.ok(Math.abs(rtp - 0.999) < 1e-12, `target=${v.target}: RTP=${rtp}, expected 0.999`);
        }
    });
    it('house edge is exactly 0.1% (from the 0.999 factor; RANGE=10001 cancels out)', () => {
        // win_chance_fair = (10000 - target) / 10000
        // win_chance_actual = (10000 - target) / 10001
        // multiplier = 0.999 / win_chance_actual → always 99.9% RTP; RANGE sets the win
        // chance but the multiplier divides by that same win chance, so the edge is the 0.999
        const target = 5000;
        const fair = 5000 / 10000; // 0.5 exactly
        const actual = (0, rng_1.theoreticalWinChance)(target);
        assert.ok(actual < fair, 'Actual win chance should be less than fair (house edge present)');
        const rtp = actual * (0, rng_1.theoreticalMultiplier)(target);
        assert.ok(Math.abs(rtp - 0.999) < 1e-12, `RTP should be 0.999, got ${rtp}`);
    });
});
// ── The operator's own Verify-tab code (profile DICE-09) ──────────────────────
describe('Second check — Duel\'s own Dice Verify-tab code, executed unmodified (evidence/verify-tab, copied 2026-09-25)', () => {
    // Not the source of src/rng.ts: that is rebuilt from docs/ALGORITHM.md. Duel's code is run as a cross-check.
    // duel.com → Provably Fair → Verify (Dice) → Expand → Copy, saved verbatim (src/operator-verifier.ts)
    const { runOperatorVerifier, rollUnits, OPERATOR_VERIFIER_PINS, OPERATOR_VERIFIER_FILE, OPERATOR_EXPECTED_LOGS } = require('../../src/operator-verifier');
    const { loadDataset, buildSeedMap } = require('../../src/loader');
    const { RANGE, MAX_FAIR } = require('../../src/rng');
    const ds = loadDataset();
    const seedMap = buildSeedMap(ds.seeds);
    const known = vectors.map((v, i) => ({ id: `known${i}`, serverSeed: v.serverSeed, clientSeed: v.clientSeed, nonce: v.nonce }));
    const captured = ds.bets.map((b, i) => ({ id: `bet${i}`, serverSeed: seedMap.get(b.response.server_seed_hashed) ?? '',
        clientSeed: b.response.client_seed, nonce: b.response.nonce }));
    const run = runOperatorVerifier([...known, ...captured]);
    it('the vendored operator file and its runner hash to their pins, the code ran, and it printed only its empty-input message', () => {
        assert.deepStrictEqual(run.files.map(f => f.match), [true, true]);
        assert.strictEqual(run.files[0].file, OPERATOR_VERIFIER_FILE);
        assert.strictEqual(run.files[0].actual, OPERATOR_VERIFIER_PINS[OPERATOR_VERIFIER_FILE]);
        assert.strictEqual(run.error, null);
        assert.deepStrictEqual(run.logs, [...OPERATOR_EXPECTED_LOGS]);
        assert.strictEqual(run.range, RANGE);
        assert.strictEqual(run.maxFair, MAX_FAIR);
    });
    it('fixed vectors: the operator code displays each of the 7 known rolls as units / 100, exactly', () => {
        vectors.forEach((v, i) => {
            const raw = run.results.get(`known${i}`);
            assert.strictEqual(raw, String(v.expectedResult / 100), `nonce=${v.nonce}`);
            assert.strictEqual(rollUnits(raw), v.expectedResult, `nonce=${v.nonce}`);
        });
    });
    it('every captured bet: the operator roll, on the integer lattice, equals the served roll and src/rng.ts', () => {
        const bad = [];
        ds.bets.forEach((b, i) => {
            const u = rollUnits(run.results.get(`bet${i}`));
            if (u === null || u !== b.response.result || u !== (0, rng_1.computeResult)(captured[i].serverSeed, b.response.client_seed, b.response.nonce))
                bad.push(String(b.response.id));
        });
        assert.deepStrictEqual(bad.slice(0, 5), []);
        assert.strictEqual(ds.bets.length, 6700);
    });
    it('rollUnits rejects strings that are not exactly String(units / 100) on 0..10000', () => {
        assert.strictEqual(rollUnits('42.34'), 4234);
        assert.strictEqual(rollUnits('0'), 0);
        assert.strictEqual(rollUnits('100'), 10000);
        assert.strictEqual(rollUnits('42.340'), null);
        assert.strictEqual(rollUnits('42.345'), null);
        assert.strictEqual(rollUnits('100.01'), null);
        assert.strictEqual(rollUnits(null), null);
    });
});
describe('Recomputed-float comparison (src/diff.ts numbersAgree, used by Steps 16–17)', () => {
    it('1-ulp libm drift agrees; a value moved by 1e-12 or more, or a distinct integer, does not', () => {
        // The stored Pass 1 runs-test p (outputs/simulation-results.json).
        const p = 0.0419960857530981;
        const ulp = 2 ** (Math.floor(Math.log2(p)) - 52);
        assert.ok((0, diff_1.numbersAgree)(p, p + ulp));
        assert.ok((0, diff_1.numbersAgree)(p, p - ulp));
        assert.ok(!(0, diff_1.numbersAgree)(p, p + 1e-12));
        assert.ok(!(0, diff_1.numbersAgree)(0.001, 0.0010000001));
        assert.ok(!(0, diff_1.numbersAgree)(3, 4));
    });
});

  },
  "tests/dice/RngSpecTests.js": function (module, exports, require, __filename, __dirname) {
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Spec self-test — docs/ALGORITHM.md §5 vectors and properties, run against src/rng.ts.
 *
 * Written by the clean-room implementer together with src/rng.ts, from docs/ALGORITHM.md and the module
 * interface alone (never from Duel's code). Integrated 20 Oct 2026: the checks are unchanged; only the
 * import path, the mocha wrapper and the reporting (failures collected instead of printed) were adapted.
 * The rejection-path search hashes 3,000,000 nonces, hence the longer timeout.
 */
const crypto_1 = require("crypto");
const rng_1 = require("../../src/rng");
const assert = __importStar(require("assert"));
const EXPECTED_CHECKS = 79;
function runSelftest() {
    let pass = 0;
    let total = 0;
    const failed = [];
    function check(name, cond, detail = '') {
        total++;
        if (cond)
            pass++;
        else
            failed.push(`${name}${detail ? '  ' + detail : ''}`);
    }
    function throws(fn) {
        try {
            fn();
            return false;
        }
        catch {
            return true;
        }
    }
    const vectors = [
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
        const digest = (0, crypto_1.createHmac)('sha256', key).update(`${v.clientSeed}:${v.nonce}`, 'utf8').digest();
        check(`${v.id} commitment`, (0, rng_1.verifyHash)(v.serverSeed, v.commitment));
        check(`${v.id} HMAC digest`, digest.toString('hex') === v.hmac);
        check(`${v.id} u32`, digest.readUInt32BE(0) === v.u32);
        const roll = (0, rng_1.computeResult)(v.serverSeed, v.clientSeed, v.nonce);
        check(`${v.id} roll`, roll === v.roll, `got ${roll}`);
        check(`${v.id} roll (buffer form)`, (0, rng_1.computeResultFromBuffer)(key, v.clientSeed, v.nonce) === v.roll);
        check(`${v.id} win flag (roll > target)`, (roll > v.target) === v.win);
        const count = BigInt(rng_1.RANGE - 1 - v.target);
        check(`${v.id} win_chance 18dp`, (0, rng_1.roundNearest)(count * rng_1.GRID, BigInt(rng_1.RANGE)).q === (0, rng_1.parseGridUnits)(v.winChance));
        check(`${v.id} win_chance float`, Math.abs((0, rng_1.theoreticalWinChance)(v.target) - Number(v.winChance)) < 1e-15);
        check(`${v.id} multiplier 18dp`, (0, rng_1.exactMultiplierUnits)(v.target).units === (0, rng_1.parseGridUnits)(v.multiplier));
        check(`${v.id} multiplier float`, Math.abs((0, rng_1.theoreticalMultiplier)(v.target) / Number(v.multiplier) - 1) < 1e-12);
        const amountUnits = (0, rng_1.parseGridUnits)(v.amount);
        const paid = v.win && amountUnits !== null ? (0, rng_1.exactPayoutUnits)(amountUnits, v.target).units : 0n;
        check(`${v.id} amount_won`, paid === (0, rng_1.parseGridUnits)(v.amountWon), `got ${paid}`);
    }
    // V6: Duel's public Verify page (roll only).
    check('V6 Verify page roll 791 ("7.91")', (0, rng_1.computeResult)('7b3c099fb0aacfb97c1e6772389e1b3eec2a8d7d6d07488bf745b0f9b2d03714', '5icuhQS3ze', 0) === 791);
    check('V6 u32 3985829334', (0, crypto_1.createHmac)('sha256', Buffer.from('7b3c099fb0aacfb97c1e6772389e1b3eec2a8d7d6d07488bf745b0f9b2d03714', 'hex'))
        .update('5icuhQS3ze:0').digest().readUInt32BE(0) === 3985829334);
    // ---- constants and bias report ----------------------------------------------
    check('RANGE = 10001', rng_1.RANGE === 10001);
    check('MAX_U32 = 2^32-1', rng_1.MAX_U32 === 4294967295);
    check('MAX_FAIR = 4294959453', rng_1.MAX_FAIR === 4294959453);
    const b = (0, rng_1.drawBiasBound)();
    check('bias: rangesAccepted = 429453 = MAX_FAIR/RANGE', b.rangesAccepted === 429453 && b.rangesAccepted * rng_1.RANGE === rng_1.MAX_FAIR);
    check('bias: whole number of ranges', b.wholeNumberOfRanges);
    check('bias: domainSize = 2^32', b.domainSize === 2 ** 32);
    check('bias: remainder = 7843 = domain - MAX_FAIR', b.remainder === 7843 && b.remainder === b.domainSize - b.maxFair);
    check('bias: residue counts equal (429453)', b.minResidueCount === 429453 && b.maxResidueCount === 429453);
    check('bias: exactly 0', b.bias === 0 && b.exact);
    check('bias: rejected draws = remainder, p = 7843/2^32', b.rejectionSampling && b.rejectedDrawsPerChunk === 7843 && b.rejectionProbabilityPerChunk === 7843 / 2 ** 32);
    // ---- grid helpers -----------------------------------------------------------
    check('GRID_DP/GRID', rng_1.GRID_DP === 18 && rng_1.GRID === 10n ** 18n && rng_1.EDGE_NUM === 999n && rng_1.EDGE_DEN === 1000n);
    check('parseGridUnits accepts plain decimals', (0, rng_1.parseGridUnits)('0') === 0n && (0, rng_1.parseGridUnits)('10') === 10n * rng_1.GRID && (0, rng_1.parseGridUnits)('0.3330333') === 333033300000000000n
        && (0, rng_1.parseGridUnits)('1.000000000000000001') === rng_1.GRID + 1n);
    check('parseGridUnits rejects non-plain input', ['-1', '1e3', '.5', '1.', ' 1', '1.0000000000000000001', '', 'abc', 1, null, undefined]
        .every((x) => (0, rng_1.parseGridUnits)(x) === null));
    check('roundNearest: below, above, tie (half-up)', (0, rng_1.roundNearest)(14n, 10n).q === 1n && (0, rng_1.roundNearest)(16n, 10n).q === 2n
        && (0, rng_1.roundNearest)(15n, 10n).q === 2n && (0, rng_1.roundNearest)(15n, 10n).tie && !(0, rng_1.roundNearest)(16n, 10n).tie
        && (0, rng_1.roundNearest)(25n, 10n).q === 3n);
    // ---- hash check false cases -------------------------------------------------
    const s1 = vectors[0];
    check('verifyHash false: other vector commitment', !(0, rng_1.verifyHash)(s1.serverSeed, vectors[1].commitment));
    check('verifyHash false: hash of ASCII hex string (§1.2 rejected form)', !(0, rng_1.verifyHash)(s1.serverSeed, (0, crypto_1.createHash)('sha256').update(s1.serverSeed, 'utf8').digest('hex')));
    check('verifyHash false: malformed seed / hash', !(0, rng_1.verifyHash)('zz' + s1.serverSeed.slice(2), s1.commitment)
        && !(0, rng_1.verifyHash)(s1.serverSeed, s1.commitment.slice(1)));
    check('verifyHash true: upper-case published hash', (0, rng_1.verifyHash)(s1.serverSeed, s1.commitment.toUpperCase()));
    // ---- input validation -------------------------------------------------------
    check('computeResult rejects bad seed / nonce', throws(() => (0, rng_1.computeResult)('abc', 'x', 0)) && throws(() => (0, rng_1.computeResult)(s1.serverSeed, 'x', -1))
        && throws(() => (0, rng_1.computeResult)(s1.serverSeed, 'x', 1.5)));
    check('multiplier refuses counts outside bands 2..9998', throws(() => (0, rng_1.theoreticalMultiplier)(10000)) && throws(() => (0, rng_1.theoreticalMultiplier)(9999))
        && throws(() => (0, rng_1.exactMultiplierUnits)(0)) && !throws(() => (0, rng_1.exactMultiplierUnits)(9998)) && !throws(() => (0, rng_1.exactMultiplierUnits)(2)));
    // ---- roll range, and the rejection path ------------------------------------
    // Search nonces on V1's seed for digests whose first chunk is >= MAX_FAIR,
    // and check the module then uses the next acceptable chunk (§2 Step 2).
    {
        const key = Buffer.from(s1.serverSeed, 'hex');
        let inRange = true;
        let rejHits = 0;
        let rejOk = true;
        const N = 3000000;
        for (let n = 0; n < N; n++) {
            const d = (0, crypto_1.createHmac)('sha256', key).update(`${s1.clientSeed}:${n}`).digest();
            const first = d.readUInt32BE(0);
            if (n < 200000 || first >= rng_1.MAX_FAIR) {
                const r = (0, rng_1.computeResultFromBuffer)(key, s1.clientSeed, n);
                if (!Number.isInteger(r) || r < 0 || r > rng_1.RANGE - 1)
                    inRange = false;
                if (first >= rng_1.MAX_FAIR) {
                    rejHits++;
                    let expected = -1;
                    for (let i = 4; i < 32; i += 4) {
                        const v = d.readUInt32BE(i);
                        if (v < rng_1.MAX_FAIR) {
                            expected = v % rng_1.RANGE;
                            break;
                        }
                    }
                    if (r !== expected)
                        rejOk = false;
                    if (r === first % rng_1.RANGE) { /* coincidence is allowed, not checked */ }
                }
            }
        }
        check('roll in 0..10000 (200000 nonces + rejection hits)', inRange);
        check(`rejection path takes next chunk (${rejHits} first-chunk rejections in ${N} nonces)`, rejHits > 0 && rejOk);
    }
    return { pass, total, failed };
}
describe('Spec self-test — src/rng.ts against docs/ALGORITHM.md (clean-room rebuild)', function () {
    this.timeout(300000);
    it(`all ${EXPECTED_CHECKS} spec vector and property checks pass`, () => {
        const r = runSelftest();
        assert.deepStrictEqual(r.failed, []);
        assert.strictEqual(r.total, EXPECTED_CHECKS);
        assert.strictEqual(r.pass, EXPECTED_CHECKS);
    });
});

  },
};
var __cache = {};

function __flatten(from, spec) {
  var base = from ? from.split('/').slice(0, -1).join('/') : '';
  var parts = (base ? base + '/' + spec : spec).split('/');
  var out = [];
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i];
    if (p === '' || p === '.') continue;
    if (p === '..') { out.pop(); continue; }
    out.push(p);
  }
  return out.join('/');
}

function __resolve(from, spec) {
  var joined = __flatten(from, spec);
  var candidates = [joined, joined + '.js', joined + '.json', joined + '/index.js'];
  for (var c = 0; c < candidates.length; c++) {
    if (Object.prototype.hasOwnProperty.call(__modules, candidates[c])) return candidates[c];
  }
  return null;
}

function __require(from, spec) {
  if (!spec.startsWith('.')) return __nodeRequire(spec);
  var id = __resolve(from, spec);
  if (!id) {
    // Not TypeScript, so tsc never emitted it — a .mjs/.cjs/.json asset the package SHIPS, such as
    // a capture reference module. Load the real file off disk relative to the package root. The
    // bundle stays self-contained for compiled code without pretending the package has no other
    // files; if the asset is genuinely missing, the error names it rather than hiding it.
    var abs = __PF_ROOT__ + '/' + __flatten(from, spec);
    try { return __nodeRequire(abs); } catch (e) {
      throw new Error('standalone verifier: unresolved module "' + spec + '" from "' + from + '" (' + e.message + ')');
    }
  }
  if (__cache[id]) return __cache[id].exports;
  var module = { exports: {} };
  __cache[id] = module;
  var dir = id.split('/').slice(0, -1).join('/');
  __modules[id](
    module,
    module.exports,
    function (s) { return __require(id, s); },
    __PF_ROOT__ + '/' + id,
    dir ? __PF_ROOT__ + '/' + dir : __PF_ROOT__
  );
  return module.exports;
}

__require('', './tests/__standalone-entry.js');
