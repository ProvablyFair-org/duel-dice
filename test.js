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
 * Linked modules: 7
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
// Target is the configuration dimension, valid over 1…9999. Phase A samples it at random,
// so the coverage question is whether the sampling actually spanned the range: the target
// space is split into ten 1000-wide bands and each must carry the floor below. The lowest
// band observed carries 403 bets, so a floor of 350 fails on a band cut to a token sample
// while leaving the honest capture passing.
exports.TARGET_MIN = 1;
exports.TARGET_MAX = 9999;
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
// capture. MIN_ODDS ≈ 0.999·10001/9999 ≈ 0.99930; MAX_ODDS = 0.999·10001/1 = 9990.999.
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
 * published algorithm for Dice — Duel's own source for the roll. Until 2026-09-25 the package said Duel
 * ships no source (and no operator verifier) and src/rng.ts cited only the fairness page; that was wrong, and this
 * file is the correction.
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
 *   3. CHECKS THE CITATIONS: every line src/rng.ts cites (OPERATOR_SOURCE_CITES) must carry, at that
 *      line number of the pinned file, the text it quotes.
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
exports.checkOperatorCites = checkOperatorCites;
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const rng_1 = require("./rng");
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
/** Every citation in src/rng.ts must quote, verbatim, the pinned operator file at the line it names. */
function checkOperatorCites(root = exports.PACKAGE_ROOT) {
    const p = path.join(root, exports.OPERATOR_VERIFIER_FILE);
    if (!fs.existsSync(p))
        return { checked: 0, bad: [`${exports.OPERATOR_VERIFIER_FILE} not found`] };
    const lines = fs.readFileSync(p, 'utf8').split('\n');
    const bad = [];
    for (const c of rng_1.OPERATOR_SOURCE_CITES) {
        const at = lines[c.line - 1];
        if (at === undefined || !at.includes(c.text))
            bad.push(`L${c.line} does not contain ${JSON.stringify(c.text)} (it reads ${JSON.stringify((at ?? '').trim())})`);
    }
    if (rng_1.OPERATOR_SOURCE_CITES.length === 0)
        bad.push('src/rng.ts cites no operator line');
    return { checked: rng_1.OPERATOR_SOURCE_CITES.length, bad };
}

  },
  "src/rng.js": function (module, exports, require, __filename, __dirname) {
"use strict";
/**
 * Duel.com Dice — RNG implementation.
 *
 * PORTED FROM THE OPERATOR'S OWN SOURCE: the Dice code panel of duel.com → Provably Fair → Verify
 * (Expand → Copy), copied verbatim by the auditor on 2026-09-25 to
 * evidence/verify-tab/duel-verify-tab-dice-2026-09-25.js (SHA-256 38b257c6…950a5b, pinned in
 * src/operator-verifier.ts). "Lxx" is a line of that file. Every citation is listed in
 * OPERATOR_SOURCE_CITES and checked against the pinned bytes by Step 5 and the unit tests — a cited
 * line that does not carry the quoted text FAILs. Step 5 also EXECUTES that file on every captured
 * bet and requires its roll (a display string, value % RANGE / 100) to equal this module's on the
 * integer lattice. (Corrected 2026-09-25: this header used to cite only duel.com/fairness/verify.)
 * The win rule and the multiplier below are NOT in the operator file — it computes the roll only.
 *
 * Algorithm: HMAC-SHA256 with rejection sampling.
 *   key     = hex_decode(serverSeed)   ← hex bytes, NOT UTF-8 string        L28, L34
 *   message = clientSeed + ":" + nonce                                     L53
 *   hash    = HMAC-SHA256(key, message)                                    L56
 *
 * Rejection sampling (modulo bias prevention):
 *   RANGE    = 10001                                                       L45
 *   MAX_U32  = 0xFFFFFFFF                                                  L44
 *   MAX_FAIR = MAX_U32 − (MAX_U32 % RANGE)                                 L48
 *   scan 4-byte (8 hex-char) chunks of hash left-to-right:                 L60, L62, L70
 *     if chunk < MAX_FAIR → result = chunk % RANGE   (0–10000)            L65, L66 (the file divides by 100 to display)
 *   every chunk rejected → throw                                           L74
 *
 * Win condition (over bet): result > target
 * Win chance:  (10000 − target) / 10001
 * Multiplier:  0.999 / win_chance
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
exports.GRID = exports.GRID_DP = exports.EDGE_DEN = exports.EDGE_NUM = exports.MAX_FAIR = exports.MAX_U32 = exports.RANGE = exports.OPERATOR_SOURCE_CITES = void 0;
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
const crypto = __importStar(require("crypto"));
// ── Operator source citations (checked, not decorative) ────────────────────
/**
 * Each entry: a line of evidence/verify-tab/duel-verify-tab-dice-2026-09-25.js and text that line
 * must contain verbatim. src/operator-verifier.ts checkOperatorCites reads the pinned file and FAILs
 * any entry whose line does not carry its text.
 */
exports.OPERATOR_SOURCE_CITES = Object.freeze([
    { line: 28, text: 'const keyBytes = hexToBytes(keyHex);', ports: 'the server seed is hex-decoded to the HMAC key' },
    { line: 34, text: "{ name: 'HMAC', hash: 'SHA-256' },", ports: 'HMAC-SHA256' },
    { line: 44, text: 'const MAX_UINT32 = 0xffffffff;', ports: 'MAX_U32' },
    { line: 45, text: 'const RANGE = 10001; // 0-10000 inclusive', ports: 'RANGE' },
    { line: 48, text: 'const MAX_FAIR = MAX_UINT32 - (MAX_UINT32 % RANGE);', ports: 'MAX_FAIR' },
    { line: 53, text: 'new TextEncoder().encode(`${clientSeed}:${nonce}`)', ports: 'the HMAC message (no cursor)' },
    { line: 60, text: 'while (offset + 8 <= hash.length) {', ports: 'eight 4-byte chunks, first to last' },
    { line: 62, text: 'const value = parseInt(hash.slice(offset, offset + 8), 16);', ports: 'chunk read as a big-endian uint32 (8 hex chars)' },
    { line: 65, text: 'if (value < MAX_FAIR) {', ports: 'accept below MAX_FAIR' },
    { line: 66, text: 'return ((value % RANGE) / 100).toString();', ports: 'roll = value mod RANGE (the file displays it / 100)' },
    { line: 70, text: 'offset += 8;', ports: 'next chunk on rejection' },
    { line: 74, text: "throw new Error('Failed to generate unbiased dice value from hash');", ports: 'every chunk rejected → throw' },
]);
exports.RANGE = 10001; // operator L45
exports.MAX_U32 = 0xFFFFFFFF; // operator L44
exports.MAX_FAIR = exports.MAX_U32 - (exports.MAX_U32 % exports.RANGE); // operator L48
/**
 * THE DRAW BIAS BOUND, COMPUTED FROM THE SAME NUMBERS THE DRAW USES.
 *
 * `computeResultFromBuffer` scans 32-bit chunks and accepts the first `value < MAX_FAIR`,
 * returning `value % RANGE`. Whether that draw is uniform on 0..RANGE-1 is decided before any
 * live roll: the accepted window [0, MAX_FAIR) must hold a WHOLE number of ranges, or the low
 * residues are over-represented and no amount of captured data corrects it. This function
 * recomputes the bound from `RANGE`, `MAX_U32` and `MAX_FAIR` — the same three constants the
 * draw reads — so the number a step prints describes the code that produced the rolls, not a
 * claim typed beside it.
 *
 * Because `MAX_FAIR = MAX_U32 − (MAX_U32 % RANGE)` is by construction a multiple of RANGE, the
 * accepted window divides exactly: every residue 0..RANGE-1 is produced by exactly
 * `MAX_FAIR / RANGE` of the accepted 32-bit values, so its conditional probability given
 * acceptance is exactly 1/RANGE and the worst-case bias is 0 — well inside the profile's 2^-32
 * ceiling. The rejection census (how many of the 2^32 chunk values fall in the discarded tail
 * [MAX_FAIR, 2^32)) is returned too, since the profile asks for it when rejection sampling is
 * the mechanism.
 *
 * Returned as numbers, never as a sentence: the profile's floor is 2^-32 and a reader has to be
 * able to compare the two.
 */
function drawBiasBound() {
    // The chunk value is parseInt of 8 hex chars → an integer in [0, 2^32 − 1], i.e. 2^32 values.
    const domainSize = exports.MAX_U32 + 1; // 2^32 possible chunk values
    const rangesAccepted = exports.MAX_FAIR / exports.RANGE; // whole number by construction
    const remainder = exports.MAX_FAIR % exports.RANGE; // 0 ⇒ the window holds a whole number of ranges
    // Residue counts across the ACCEPTED window [0, MAX_FAIR): a value v is accepted iff v < MAX_FAIR,
    // and each residue r is produced by floor((MAX_FAIR − 1 − r) / RANGE) + 1 accepted values.
    const minResidueCount = Math.floor(exports.MAX_FAIR / exports.RANGE);
    const maxResidueCount = remainder === 0 ? minResidueCount : minResidueCount + 1;
    // Bias = the largest gap between any residue's share of the accepted window and the ideal 1/RANGE.
    const bias = Math.max(maxResidueCount / exports.MAX_FAIR - 1 / exports.RANGE, 1 / exports.RANGE - minResidueCount / exports.MAX_FAIR);
    const rejectedDrawsPerChunk = domainSize - exports.MAX_FAIR; // values in the discarded tail [MAX_FAIR, 2^32)
    return {
        algorithm: 'rejection-sampling',
        range: exports.RANGE,
        maxU32: exports.MAX_U32,
        maxFair: exports.MAX_FAIR,
        rangesAccepted,
        wholeNumberOfRanges: remainder === 0,
        domainSize,
        remainder,
        minResidueCount,
        maxResidueCount,
        bias,
        exact: remainder === 0,
        rejectionSampling: true,
        rejectedDrawsPerChunk,
        rejectionProbabilityPerChunk: rejectedDrawsPerChunk / domainSize,
    };
}
/**
 * Compute the dice result (0–10000) from revealed seed components.
 * Key must be the hex-decoded server seed buffer.
 */
function computeResultFromBuffer(keyBuffer, clientSeed, nonce) {
    const message = `${clientSeed}:${nonce}`; // operator L53
    const hash = crypto.createHmac('sha256', keyBuffer).update(message).digest('hex'); // operator L27–L42, L56
    for (let off = 0; off + 8 <= hash.length; off += 8) { // operator L60, L70
        const value = parseInt(hash.substring(off, off + 8), 16); // operator L62
        if (value < exports.MAX_FAIR) { // operator L65
            return value % exports.RANGE; // 0–10000 integer                    operator L66 (without the display / 100)
        }
    } // all rejected → operator L74 throws
    // Probability ~1.24×10⁻⁴⁶ — practically unreachable
    throw new Error(`RNG hash exhausted for nonce=${nonce}`);
}
function computeResult(serverSeed, clientSeed, nonce) {
    const key = Buffer.from(serverSeed, 'hex');
    return computeResultFromBuffer(key, clientSeed, nonce);
}
/** SHA-256 commit-reveal: verify SHA-256(hex_bytes(serverSeed)) === serverSeedHashed */
function verifyHash(serverSeed, serverSeedHashed) {
    const seedBytes = Buffer.from(serverSeed, 'hex');
    const computed = crypto.createHash('sha256').update(seedBytes).digest('hex');
    return computed === serverSeedHashed;
}
/** Theoretical win chance for an "over" bet at the given target (0–9999). */
function theoreticalWinChance(target) {
    return (10000 - target) / exports.RANGE;
}
/** Theoretical multiplier for a win at the given target. */
function theoreticalMultiplier(target) {
    return 0.999 / theoreticalWinChance(target);
}
// ── EXACT ARITHMETIC ON THE SERVED 1e-18 GRID ───────────────────────────────────
// Duel serves `multiplier`, `amount_currency` and `amount_won` as decimal strings with at most 18
// fractional digits. Parsing them to a double and comparing at a tolerance throws away the one
// property that makes an exact check possible: every served figure is an integer count of 1e-18
// units. The helpers below keep it that way — BigInt end to end, no float anywhere — so a served
// figure one grid unit (1e-18) off its declared rule is a mismatch, not noise.
//
// The declared formula is multiplier = 0.999 / ((10000 − target) / RANGE), i.e. the exact rational
//   EDGE_NUM · RANGE / (EDGE_DEN · (10000 − target)),   EDGE_NUM / EDGE_DEN = 999 / 1000 = 0.999
// and the declared rounding onto the grid is to the NEAREST unit. (The capture holds no exact tie,
// so the direction a tie would round is unwitnessed; the helpers count ties so a step can say so.)
/** The declared edge factor 0.999 as an exact ratio (published fairness page). */
exports.EDGE_NUM = 999n;
exports.EDGE_DEN = 1000n;
/** Fractional digits of every served money / multiplier string. */
exports.GRID_DP = 18;
/** One unit of the served grid is 1 / GRID. */
exports.GRID = 10n ** BigInt(exports.GRID_DP);
/**
 * A served decimal string → integer units of 1e-18, or null when it is not a plain non-negative
 * decimal with at most 18 fractional digits (a value off the grid cannot be compared on it).
 */
function parseGridUnits(s) {
    if (typeof s !== 'string' || !/^\d+(\.\d{1,18})?$/.test(s))
        return null;
    const [i, f = ''] = s.split('.');
    return BigInt(i) * exports.GRID + BigInt((f + '0'.repeat(exports.GRID_DP)).slice(0, exports.GRID_DP));
}
/** num / den rounded to the nearest integer (ties up); `tie` reports an exact half. */
function roundNearest(num, den) {
    const q = num / den, r = num % den;
    return { q: 2n * r >= den ? q + 1n : q, tie: 2n * r === den };
}
/** The declared multiplier at `target`, rounded to the nearest 1e-18 unit. */
function exactMultiplierUnits(target) {
    const r = roundNearest(exports.EDGE_NUM * BigInt(exports.RANGE) * exports.GRID, exports.EDGE_DEN * BigInt(10000 - target));
    return { units: r.q, tie: r.tie };
}
/**
 * The declared settlement of a win: stake × the EXACT formula multiplier (not the rounded served
 * string), rounded to the nearest 1e-18 unit. Measured on the capture before it was adopted:
 * rounding stake × the served multiplier instead disagrees by one unit wherever that product ends
 * in an exact half, and a half-down rule on it fails elsewhere; this rule is the one that fits
 * every win.
 */
function exactPayoutUnits(amountUnits, target) {
    const r = roundNearest(amountUnits * exports.EDGE_NUM * BigInt(exports.RANGE), exports.EDGE_DEN * BigInt(10000 - target));
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
describe('Operator source — Duel\'s own Dice Verify-tab code, executed unmodified (evidence/verify-tab, copied 2026-09-25)', () => {
    // duel.com → Provably Fair → Verify (Dice) → Expand → Copy, saved verbatim (src/operator-verifier.ts)
    const { runOperatorVerifier, checkOperatorCites, rollUnits, OPERATOR_VERIFIER_PINS, OPERATOR_VERIFIER_FILE, OPERATOR_EXPECTED_LOGS } = require('../../src/operator-verifier');
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
    it('every operator line src/rng.ts cites carries the quoted text verbatim', () => {
        const c = checkOperatorCites();
        assert.deepStrictEqual(c.bad, []);
        assert.ok(c.checked > 0);
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
