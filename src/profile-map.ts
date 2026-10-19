/**
 * Which ProvablyFair.org Dice profile check each scored step implements.
 *
 * WHY THIS FILE EXISTS. The framework's game profile declares checks DICE-01 … DICE-30. This
 * suite scores 21 steps under its own numbering, which every chapter cites by number and which
 * therefore cannot be renumbered to match. Without a written mapping the only way to relate the
 * two was to read all 21 steps by hand and type the answer into the profile — where it went stale
 * the moment a step changed, silently, because nothing re-derived it. The mapping is declared
 * here, emitted into `outputs/verification-results.json` beside the step results, and read back by
 * `pf-audit matrix`, which prints the conformance matrix and exits 1 when a HARD_FAIL check has
 * nothing implementing it.
 *
 * THIS FILE LABELS; IT DOES NOT CHECK. Nothing here can make a step pass or fail. An id claimed
 * for a step the step does not implement is a false statement in a published artifact, so the
 * rule is the profile's own `asserts` text: claim the check only if the step's assertion actually
 * decides it. This mapping was written by reading the CURRENT step code (the package was hardened
 * 2026-09-18 and the profile's `status.duel.step` fields describe an earlier step layout — they
 * were NOT trusted).
 *
 * COVERAGE DESCRIBES THE PACKAGE, NOT THE STEP.
 *   full    — nothing the profile's `asserts` requires is unimplemented; where a check is split
 *             across two steps both say `full` and each note says which half it carries.
 *   partial — something the profile requires is implemented nowhere in this package, and the note
 *             says what. `partial` is a disclosure, never a softer word for `full`.
 * A check no step claims is absent from the matrix by construction: that is the point.
 */

export type Coverage = 'full' | 'partial';

export interface CheckClaim {
  id: string;
  coverage: Coverage;
  /** For `partial`: what the profile requires that this package does not do. */
  note?: string;
}

export interface StepClaims {
  claims: CheckClaim[];
  /** Required when `claims` is empty: why the step answers no profile check. */
  reason?: string;
}

export const PROFILE_GAME = 'dice';
export const PROFILE_VERSION = '1.0.2';

/** Scored step number → the profile checks it implements. Every step 1..21 has an entry. */
export const STEP_CLAIMS: Record<number, StepClaims> = {
  1: { claims: [{ id: 'DICE-01', coverage: 'full' }] },
  2: { claims: [{ id: 'DICE-02', coverage: 'full' }] },
  3: {
    claims: [{
      id: 'DICE-03', coverage: 'full',
      note: 'hash half — server_seed_hashed is identical across every bet within each epoch; the '
        + 'same-client-seed conjunct of DICE-03 is carried by Step 4 (one distinct client seed per '
        + 'epoch)',
    }],
  },
  4: {
    claims: [
      {
        id: 'DICE-04', coverage: 'full',
        note: 'strict nonce continuity (0..49, no gap/repeat/reorder), single client seed per '
          + 'epoch and first-nonce-0 are all enforced as HARD FAILs; a capture-retry gap (nonce 50 '
          + 'present, exactly one of 0..49 missing) is reconstructed from the revealed seed whose '
          + 'SHA-256 matches the commitment the capture recorded before that epoch\'s first bet (a '
          + 'consistency check; the timing rests on that capture record) and is emitted as a FLAG with '
          + 'origin = capture — '
          + 'counted, carried as limitation DL-1 in MANIFEST.md, verdict-neutral (Full Pass, exit 0) '
          + 'and never scored PASS; an unverifiable gap (no revealed seed, or a seed that does not '
          + 'hash to the commitment) is a verdict-affecting FLAG instead',
      },
      {
        id: 'DICE-03', coverage: 'full',
        note: 'client-seed half — exactly one client seed per epoch is asserted here; the '
          + 'same-hash conjunct of DICE-03 is carried by Step 3',
      },
    ],
  },
  5: {
    claims: [{
      id: 'DICE-07', coverage: 'full',
      note: 'every bet with a revealed seed is recomputed to its recorded roll by EXACT INTEGER '
        + 'equality on the 0..10000 lattice (no tolerance), AND the number of bets recomputed is '
        + 'asserted to equal the audited population expectedBets = 6,700: a bet whose server seed is '
        + 'unrevealed and so cannot be recomputed is a FAIL of THIS step, not a silent exclusion '
        + '(the coverage guard fires when recomputed != expectedBets). In this capture every one of the '
        + '134 epochs with bets has its commitment revealed, so skipped = 0',
    }, {
      id: 'DICE-24', coverage: 'full',
      note: 'asserts: "The site verifier\'s derive.js for this casino is generated from (or hash-matched to) the adapter\'s '
        + 'computeRoll; the package records that hash." HASH-MATCHED AND EXECUTED, two player verifiers (added 2026-09-25, '
        + 'ported from Duel Mines / Keno). (1) DOCS SITE: VerifyBets games/dice/derive.js + its one import lib/hmac-sha256.js, '
        + 'read with `git cat-file -p origin/main:<path>` from mikepforg/pf-audit-duel origin/main @ bd4d59c (derive.js last '
        + 'changed 4aaa1b2, 2026-06-07), vendored under verifier-parity/ with both SHA-256 recorded in src/site-verifier.ts '
        + '(derive.js 213b61b4…, hmac-sha256.js bc30bfe9…); Step 5 FAILs unless the copies hash to the pins, then runs the '
        + 'site\'s own deriveDice on every bet — bound to EXPECTED_BETS = 6,700 — and FAILs on any roll that differs from the '
        + 'served roll or src/rng.ts computeResult, any win flag that differs from the served is_win, a win chance not '
        + 'bit-identical to theoreticalWinChance, or a multiplier not bit-identical to theoreticalMultiplier on a win / not 0 '
        + 'on a loss. Measured 6,700/6,700, 0 differ on each. Recorded, not scored: the page displays the multiplier with '
        + 'toFixed(4); on 4 wins the served 18-dp multiplier sits exactly on a 4-dp half and on 2 of them (67.50675, 3.64635) '
        + 'the nearest double lies below and the page prints the lower digit — no 4-dp display rule is declared. (2) LIVE '
        + 'SITE: www.provablyfair.org/verify-bets, GET 2026-09-25 — the three chunks the Duel derivation needs (Turbopack '
        + 'runtime turbopack-828b80f5…, page chunk 34934e0e… carrying module 7721 → verifyDuelsGame → the Duel Dice method, '
        + 'process-shim chunk 4f34301b…) vendored byte for byte and pinned with the runner in src/live-site-verifier.ts; the '
        + 'site\'s own code is executed on every bet and its roll (mapped exactly onto the /100 lattice) must equal the served '
        + 'roll and src/rng.ts and its printed server-seed hash the served commitment: 6,700/6,700, 0 differ. The live page '
        + 'computes no win flag or multiplier for Duel Dice. scripts/check-site-verifier.mjs <site derive.js> | --live '
        + 're-checks a site checkout / the live deploy against the pins at release time. FAIL probed (M05f derive.js logic '
        + 'changed AND re-pinned, M05g derive.js byte changed without re-pin, M05h live-site chunk byte changed without '
        + 're-pin, M05i the live Duel Dice roll changed AND the chunk re-pinned, M05j the live page\'s printed seed hash '
        + 'changed AND re-pinned)',
    }],
  },
  6: {
    claims: [{
      id: 'DICE-06', coverage: 'partial',
      note: 'client-seed-influence half — MODEL-RATE GATE (ported 2026-09-24 from Duel Mines Step 6): a '
        + 'wrong client seed on 5 bets from each of the 134 epochs (670, bound to EXPECTED_EPOCHS) must '
        + 'change the roll except for collisions held to the rate the 10,001-point lattice predicts, E = '
        + 'Σ 1/10001, bound E + 5σ + 1 — measured 0 collisions, E 0.0670, bound 2.36; EMPTY-SEED CONTROL '
        + '(clientSeed = "") over all 6,700 bets on the same bound — measured 1 collision, E 0.6699, bound '
        + '5.76. This replaced the former `changed/tested > 0.95` rule, which forgave 1 bet in 20 ignoring '
        + 'the client seed. FAIL probed (M06, M06b). The Phase D recomputation and predictable-seed '
        + 'disclosure are Step 15. PARTIAL for one reason only: the profile requires the A–C client-seed '
        + 'generator to be a CSPRNG, and capture/capture-auto.reference.js generateClientSeed (lines 256–260) is '
        + 'Math.random(). Classified RULE-NEWER-THAN-CAPTURE: the capture ran 2026-04-11 (dataset '
        + 'meta.createdAt), the CSPRNG requirement is in the profile standard of 2026-09-23. Disclosed as '
        + 'MANIFEST DL-2 (6,200 of 6,700 bets); no verifier change can make the generator a CSPRNG',
    }],
  },
  7: {
    claims: [
      {
        id: 'DICE-11', coverage: 'full',
        note: 'EXACT ON THE DECLARED MONEY GRID (2026-09-24): every served money string is parsed to '
          + 'integer 1e-18 units (BigInt, no float) and compared with no tolerance. Each of the 2,519 '
          + 'wins must (a) equal the declared settlement rule — nearest 1e-18 unit of stake × the exact '
          + 'formula multiplier 0.999·10001/(10000 − target) — and (b) lie within ½ unit of stake × the '
          + 'SERVED multiplier (payout = amount × multiplier on the grid; 26 wins sit exactly on a half '
          + 'unit, which is why the bound is ½ and inclusive); each of the 4,181 losses credits exactly 0 '
          + 'units; a string off the grid is an error. The rule was measured before adoption: rounding '
          + 'stake × the served multiplier disagrees by one unit on 16 wins and half-down on it on 10, '
          + 'the exact-formula rule fits 2,519/2,519. Replaces the relative 1e-12 on parsed doubles, '
          + 'which forgave up to 10^6 grid units. FAIL probed (M07, M07c: a win nudged by ONE 1e-18 '
          + 'unit). The capture holds no exact settlement tie, so tie direction is unwitnessed',
      },
      {
        id: 'DICE-12', coverage: 'partial',
        note: 'what IS asserted, in Step 7: all 200 Phase C elevated-stake ($10, 1,000× the base 0.01) '
          + 'bets recompute to their recorded roll by exact integer equality (0 mismatch); the engine '
          + 'takes no wager argument (computeResult arity 3), so the roll does not depend on stake. In '
          + 'the duel.com dice config as fetched 2026-10-05 in a logged-in session (read-only GET: E14; '
          + 'MANIFEST.md#scaling-edge) stake selects the edge tier; which tier Duel\'s server applies above '
          + 'the 0.1 % tier is not verified (DL-15), '
          + 'and both captured stakes are in the 0.1 % tier, so the price comparison that follows holds '
          + 'within that tier only (scaled tiers: DL-15); the SAME CONFIG AT BOTH STAKES — Phase C '
          + 'and the 500 base-stake bets at the same target 9,700 are served one identical multiplier '
          + 'value on the 1e-18 grid (new 2026-09-24, FAIL probed M07d); and every Phase C win settles by the same exact '
          + '1e-18-grid rule as every base-stake win. PARTIAL for one reason only: the profile floor is '
          + '"≥ 100 elevated-stake wins at ~50 % win chance"; Phase C was played at target 9,700 (~3 %), '
          + 'so the elevated-stake payout path has 5 witnesses. The floor is printed as ASSUMED with that '
          + 'count (phaseCWinFloorMet: false), never silently passed. Searched: the dataset has exactly '
          + 'two stakes (0.01 and 10) and 5 wins at 10. Classified RULE-NEWER-THAN-CAPTURE: capture '
          + '2026-04-11, floor from the 2026-09-23 standard. Disclosed as MANIFEST DL-6',
      },
    ],
  },
  8: {
    claims: [
      {
        id: 'DICE-10', coverage: 'full',
        note: 'the recorded win flag equals the declared win rule (is_win = result > target) for '
          + 'all 6,700 bets, the single exact tie in the capture (result == target) is witnessed as '
          + 'a loss, AND every recorded roll is asserted here in its own right to be an integer '
          + 'inside the declared outcome range [0, 10000] — no longer left implicit to Step 5\'s '
          + 'lattice recomputation',
      },
      {
        id: 'DICE-17', coverage: 'full',
        note: 'the audited direction mode {over} (roll-under not captured) is recomputed at full coverage (the win '
          + 'rule on all 6,700 bets) and the observed bet_type set is asserted equal to it exactly; '
          + 'the strict boundary is WITNESSED BY DATA (not from source alone) — one tie (result == '
          + 'target) settled as a loss and one just-above-tie (result == target+1) settled as a '
          + 'win, two live observations straddling the boundary that discriminate the strict > rule '
          + 'from result >= target; the roll floor (0) is reached by 2 captured bets (50127125, '
          + '50151385, both losses), the roll ceiling (RANGE-1 = 10,000) is unreached by the 6,700-bet '
          + 'capture (max observed 9,998), and both are WITNESSED EMPIRICALLY by the pinned '
          + '2,000,000-draw uniformity census whose observed roll span is exactly [0, 10000]. Duel\'s own '
          + 'Verify-tab code (evidence/verify-tab/, copied 2026-09-25) computes the roll only, not the win '
          + 'rule, so it cannot witness the boundary; the data witness is the anchor',
      },
    ],
  },
  9: {
    claims: [{
      id: 'DICE-13', coverage: 'full',
      note: 'EXACT ON THE DECLARED ROUNDING (2026-09-24): the served 18-dp multiplier is parsed to integer '
        + '1e-18 units and must EQUAL the nearest 1e-18 unit of the exact rational 999·10001 / (1000·'
        + '(10000 − target)) = 0.999 / ((10000 − target) / 10001), BigInt integer equality on all 6,700 '
        + 'bets (0 mismatches, 0 exact ties). Replaces abs 1e-6 on a parsed double (10^12 grid units). '
        + 'FAIL probed (M09, M09b: multiplier nudged by ONE 1e-18 unit). The edge factor 0.999 is declared '
        + 'to the published fairness page, and the derivation reads only request.target — no '
        + 'operator-supplied odds field feeds it. This is the 0.1 % edge tier, which holds every captured '
        + 'bet; Duel\'s scaled tiers are not verified (DL-15)',
    }],
  },
  10: {
    claims: [{
      id: 'DICE-18', coverage: 'full',
      note: 'win-probability half — the win chance (10000 − target) / 10001 is derived from the '
        + 'outcome lattice and the operator win_chance field is only COMPARED to it (1e-14), never '
        + 'used in the derivation; the lattice-enumeration anchor and the injected-corruption '
        + 'negative control that complete DICE-18 are carried by Step 13',
    }],
  },
  11: {
    claims: [{
      id: 'DICE-05', coverage: 'full',
      note: 'population half — bets (6,700), seed records (138) and per-phase bet/seed counts are '
        + 'compared against the EXPECTED_* code constants in src/loader.ts, not the dataset header; '
        + 'the epoch-count and epoch-size half of DICE-05 is carried by Step 14',
    }],
  },
  12: {
    claims: [
      { id: 'DICE-26', coverage: 'full',
        note: 'the live SHA-256 of the dataset equals the constant pinned in src/loader.ts, checked '
          + 'in the verify.ts pre-flight (aborts before any step runs) and re-asserted here; the '
          + 'game has no separate constants/config file to pin (constants live in src/loader.ts)' },
      {
        id: 'DICE-27', coverage: 'full',
        note: 'the dataset is pinned in src/ and the run writes only to outputs/run/ (verify never '
          + 'rewrites the committed copies unless PF_EMIT=1); .gitignore un-ignores '
          + 'verification-results / determinism-log / chi-squared-results / rtp-convergence AND '
          + 'simulation-results by name, and simulate.ts no longer emits generatedAt so '
          + 'outputs/simulation-results.json carries no run metadata and reproduces byte-identical on '
          + 're-run. ARTIFACT PINS (2026-09-24, ported from Duel Mines): src/artifact-pins.ts pins '
          + 'simulation-results.json, rtp-convergence.html, determinism-log.json and '
          + 'chi-squared-results.json by SHA-256 and this step FAILS on a mismatch, an absent file, or '
          + 'run metadata inside a pinned JSON artifact; generatedAt was removed from tests/verify.ts '
          + '(the generator) and the two verifier artifacts re-emitted with PF_EMIT=1 — every value '
          + 'unchanged, proven by field diff. verification-results.json is not byte-pinned (this step\'s '
          + 'own result lives in it) and is held by the field-level reproduction gate instead, with no '
          + 'field excluded. src/domains.ts now declares a value domain for EVERY numeric leaf of the '
          + 'committed statistical artifacts (simulation-results / chi-squared-results / '
          + 'determinism-log — bounds derived from src/loader.ts, src/rng.ts and the frozen '
          + 'src/simulate.ts design, never from the artifact), and this step validates them in BOTH '
          + 'directions on every run: every leaf within its domain AND every leaf path covered by a '
          + 'rule, so a re-pinned but physically impossible scalar (a negative count, a probability '
          + '> 1, an RTP < 0) or a new undeclared numeric field FAILS the step',
      },
    ],
  },
  13: {
    claims: [
      {
        id: 'DICE-18', coverage: 'full',
        note: 'anti-circularity half — the win probability is derived from the lattice and the win '
          + 'rule ALONE and cross-checked against a literal 10,001-point tally on every distinct '
          + 'served target (an independent enumeration that cannot share a scaling/off-by-one bug '
          + 'with the closed form), and an explicit injected-corruption NEGATIVE CONTROL confirms '
          + 'the exact-equality predicate Step 5 uses rejects a corrupted roll and a NaN while '
          + 'accepting the true roll (falsifiable, not a vacuous PASS); the RTP = win_chance × '
          + 'multiplier = 0.999 identity closes it. The win-chance-vs-operator-field comparison '
          + 'half is carried by Step 10',
      },
      {
        id: 'DICE-19', coverage: 'full',
        note: 'the effective edge is derived per target from the lattice and the multiplier formula '
          + '(1 − RTP = 0.001 exactly at every integer target 1..9999) and equals the declared 0.1 % '
          + 'claim, with no per-target deviation to flag',
      },
    ],
  },
  14: {
    claims: [{
      id: 'DICE-05', coverage: 'full',
      note: 'epoch half — the epoch count (134) and the exact epoch size (50 bets) are compared '
        + 'against the EXPECTED_EPOCHS / EXPECTED_EPOCH_SIZE code constants in src/loader.ts; the '
        + 'bets/seeds/phase-count half of DICE-05 is carried by Step 11',
    }],
  },
  15: {
    claims: [{
      id: 'DICE-06', coverage: 'partial',
      note: 'Phase-D-recomputation half — every Phase D bet with a player-set client seed '
        + 'recomputes to its recorded roll (500/500) and 10 distinct client seeds are present; the '
        + 'client-seed-influence half is carried by Step 6. The predictable Phase D seeds '
        + '(\'pfaudit\' + base36 millisecond timestamp) are now disclosed with all 10 exposed '
        + 'epochs enumerated in MANIFEST DL-3, and the A–C generator is disclosed in '
        + 'capture/capture-auto.reference.js. PARTIAL only because that A–C generator is Math.random(), not '
        + 'the CSPRNG the profile requires (DL-2) — rule-newer-than-capture (capture 2026-04-11, '
        + 'standard 2026-09-23), disclosed, not closable by a verifier change',
    }],
  },
  16: {
    claims: [{
      id: 'DICE-20', coverage: 'full',
      note: 'a dedicated 2,000,000-draw uniformity census (chi-squared RE-DERIVED in verify from the '
        + '100-bin histogram, two-sided at α_screen; lag-1 and Wald–Wolfowitz runs, the runs z '
        + 're-derived from the stored cell counts; the three screens Bonferroni-corrected to α/3 so '
        + 'the step\'s family-wise level is α) plus edge convergence on ten target bands spanning '
        + 'both ends of 1..9999 at 1,000,000 bets each, every band\'s RTP re-derived from its stored '
        + 'win count and required within 5·SE of the flat 0.999. The census (histogram, win counts) '
        + 'is a deterministic function of the pinned seeds — byte-reproducible; the derived '
        + 'statistics reproduce within the reproduction tolerance. The one raw statistic is lag-1 '
        + '(the autocorrelation needs the un-stored 2M-draw sequence), disclosed as DL-7; its z is '
        + 're-derived as lag1·√n and bounded by its screen',
    }],
  },
  17: {
    claims: [{
      id: 'DICE-21', coverage: 'full',
      note: 'every revealed seed × 10,000 nonces; early window = nonces 0–49 (the 50-bet captured '
        + 'depth per epoch; the captured nonce range is 0–50, nonce 50 occurring only in the 4 '
        + 'capture-retry epochs, DL-1), reference window = the remainder (50–9999); the statistic '
        + 'is the payout-weighted return '
        + 'of the bands the casino ACTUALLY SERVED in that epoch, standardized by the EXACT per-bet '
        + 'mean and variance of that return (a sum of independent scaled Bernoullis — a scaled '
        + 'Poisson-binomial null — aggregated across seeds). Every window is RE-DERIVED in verify '
        + 'from the dataset\'s own revealed seeds (134 × 10,000 HMACs) and compared to the stored '
        + 'census with exact equality; the exact moments standardize the aggregate return, then a '
        + 'pre-registered ONE-SIDED normal (CLT) lower-tail rule is applied at α (cherry-picking '
        + 'shorts the early window the player saw); direction split and detection power printed',
    }],
  },
  18: {
    claims: [{
      id: 'DICE-15', coverage: 'partial',
      note: 'all three coverage dimensions the profile names are asserted against a plan pinned in '
        + 'src/loader.ts, not described in prose: (1) TARGET SPACE — ten 1000-wide bands each held '
        + 'to the MIN_BETS_PER_TARGET_BAND floor, covering both ends of 1..9999; (2) STAKE LEVELS — '
        + 'both declared stake levels ($0.01 base and $10 elevated) each held to the MIN_BETS_PER_STAKE_TIER '
        + 'floor, with any bet at an undeclared stake counted as a gap; (3) DIRECTION MODE — the '
        + 'declared set DECLARED_DIRECTION_MODES is the AUDITED scope {over}, and the observed bet_type '
        + 'set is asserted to equal it exactly (every audited mode exercised, no other mode present), '
        + 'so a mode the verifier is not written for cannot enter the dataset unnoticed. PARTIAL: Duel '
        + 'also offers roll-under (evidence/E10-bet-history.png), which the capture did not exercise '
        + '(0 under bets) and this audit does not cover, so the profile floor "all published '
        + 'configurations" is not met (DL-14)',
    }],
  },
  20: {
    claims: [{
      id: 'DICE-14', coverage: 'full',
      note: 'the multiplier is recomputed from the target (theoreticalMultiplier, never the '
        + 'operator response.multiplier field) at every distinct win-chance point the capture '
        + 'served and asserted STRICTLY DECREASING in win chance (0 inversions, 0 targets mapping '
        + 'to >1 multiplier); and every quoted multiplier on all 6,700 bets is checked to lie '
        + 'within the declared odds band [MIN_ODDS, MAX_ODDS] derived in src/loader.ts from the '
        + 'valid target band 1..9999 and the formula (not from the data). FLAG policy: a violation '
        + 'is disclosed, not failed',
    }],
  },
  19: {
    claims: [{
      id: 'DICE-08', coverage: 'full',
      note: 'the draw is rejection sampling over a 2^32 uint32 domain; the step recomputes the '
        + 'worst-case modulo bias from the same RANGE / MAX_U32 / MAX_FAIR constants the draw reads '
        + 'and asserts BOTH that MAX_FAIR = 10001 × 429453 is a whole number of ranges (so each of '
        + 'the 10,001 residues receives exactly 429453 accepted values and the bias is 0) AND that '
        + 'the bias is inside the profile\'s 2^-32 ceiling; the rejection census (discarded-tail size '
        + 'and per-chunk rejection probability) is printed as the profile requires for a '
        + 'rejection-sampling draw',
    }],
  },
  21: {
    claims: [{
      id: 'DICE-22', coverage: 'full',
      note: 'the 6,700 captured rolls are fitted to the uniform lattice (Kolmogorov–Smirnov against '
        + 'the discrete-uniform CDF) and tested for serial dependence (lag-1 autocorrelation and a '
        + 'Wald–Wolfowitz runs test), in capture order. INFORMATIONAL and verdict-light by design — '
        + 'a 6,700-roll sample has little power, so a deviation is reported as INFO (never a FLAG or a '
        + 'hard fail, never counted, verdict unchanged — profile policy INFORMATIONAL, adopted 2026-09-29); the distribution itself is proven EXACTLY by Step 5\'s '
        + 'per-bet recomputation and the 2M-draw census (Step 16). It is a scored step because its '
        + 'statistics REACT to the sample: the mutation battery corrupts the captured rolls, the '
        + 'step prints [INFO] and the run exits non-zero (M21), so it is falsifiable rather than a '
        + 'vacuous always-PASS (mechanism ported from HouseBets Steps 11 & 13)',
    }],
  },
};

/**
 * Checks this casino's design makes inapplicable. The reason is the declaration: a check that
 * simply never appears is a gap, and one that says why it cannot apply is an answer. Each is the
 * result of evaluating the profile check's `applies` predicate against declarations/duel.dice.json.
 */
export const NOT_APPLICABLE: Array<{ id: string; reason: string }> = [
  {
    id: 'DICE-16',
    reason: 'applies = { money.balanceField, notNull: true }; the declaration sets money.balanceField '
      + '= null and money.walletFields = null — no bet response carries a running balance or wallet '
      + 'credit field, so there is no consecutive-bet delta to reconcile',
  },
];

/**
 * Checks a package artifact answers rather than a scored step. `none` means the artifact does not
 * exist — recorded so the gap is machine-readable instead of merely absent.
 */
export const PACKAGE_CHECKS: Array<{ id: string; artifact: string; coverage: Coverage | 'none'; note: string }> = [
  {
    id: 'DICE-09',
    artifact: 'tests/dice/DiceTests.ts (Operator source block) + src/rng.ts OPERATOR_SOURCE_CITES + src/operator-verifier.ts + Step 5',
    coverage: 'full',
    note: 'CORRECTED 2026-09-25. This note used to say Duel ships no source, so the citation was to the fairness '
      + 'page (E03, which shows the code panel collapsed). Duel publishes the Dice code on its Verify tab; the '
      + 'auditor copied it verbatim on 2026-09-25 (duel.com → Provably Fair → Verify → Expand → Copy) to '
      + 'evidence/verify-tab/duel-verify-tab-dice-2026-09-25.js (E13, SHA-256 38b257c6…), pinned with its runner in '
      + 'src/operator-verifier.ts. The asserts, each met: (1) "unit tests reproduce at least one captured bet from its '
      + 'revealed seed … against the operator\'s published algorithm" — the Operator source block in '
      + 'tests/dice/DiceTests.ts EXECUTES that file unmodified on all 6,700 captured bets: its validateDiceResult '
      + 'string ((value % 10001) / 100).toString(), mapped onto the 0..10000 lattice by rollUnits (which rejects any '
      + 'string that is not exactly String(units / 100)), equals the served roll and src/rng.ts on 6,700/6,700; (2) '
      + '"fixed vectors" — the same block requires it to print each of the 7 known rolls exactly as units / 100; (3) '
      + '"the adapter cites the operator source line it ports" — src/rng.ts OPERATOR_SOURCE_CITES names 12 lines '
      + '(L28 hex-decoded key … L66 value % RANGE, L74 throw) with the text each must carry, and checkOperatorCites '
      + 'FAILs any that does not: 12/12. Step 5 runs the same execution (plus the file\'s own RANGE / MAX_FAIR against '
      + 'src/rng.ts) and citation check in the verifier. FAIL probed: M05c (a logic line of the operator file changed '
      + 'AND re-pinned → disagreement), M05d (a byte changed without re-pin → hash mismatch), M05e (a citation moved '
      + 'to a line that does not carry its text). Not established: that the Verify button, or Duel\'s server, runs '
      + 'exactly this code',
  },
  {
    id: 'DICE-23', artifact: 'MANIFEST.md#adversarial-matrix', coverage: 'full',
    note: 'MANIFEST "Adversarial matrix" carries the standardized framework matrix between the '
      + 'S5-MATRIX:START/END markers with the exact framework IDs S5-1 … S5-8, each row a Pass / '
      + 'Not tested — disclosed verdict tied to a real Duel Dice scored step or capture: S5-1 seed '
      + 'substitution [Step 1, Step 2], S5-2 client-seed [Step 6, Step 15], S5-3 stake-conditional '
      + '[Step 7], S5-4 server-seed cherry-picking [Step 17; DICE-06], S5-5 seed-rotation race (Not '
      + 'tested — disclosed, instant-settle archetype), S5-6 multiplier tampering [Step 7, Step 9], '
      + 'S5-7 nonce manipulation [Step 4], S5-8 range-mapping bias [Step 5, Step 19]. Two '
      + 'supplementary rows follow the matrix: S5-S1 multi-account isolation (Not tested — single '
      + 'account) and S5-D1 player-favourable band hunt (0 +EV targets, flat 0.1% edge in the 0.1% tier)',
  },
  {
    id: 'DICE-25', artifact: 'MANIFEST.md#verify-a-bet', coverage: 'full',
    note: 'MANIFEST "Verify a bet" now carries an ordered six-step "Verify one of your own bets" '
      + 'paste-path in the declaration\'s served field names: (1) save the commitment shown before '
      + 'betting, then reveal the seed — the Dice fairness panel after seed rotation; (2) which fields '
      + 'to paste — serverSeed, the saved server_seed_hashed, client_seed, nonce, target, amount and '
      + 'the served outcome; (3) the exact commitment encoding SHA-256(hex_decode(serverSeed)) == the '
      + 'saved server_seed_hashed (hash equality; assurance about timing comes from the saved record); (4) the roll '
      + 'formula HMAC-SHA256 rejection sampling → chunk % 10001 via the pasteable verifyDiceBet(); '
      + '(5) the strict win rule is_win == (result > target); (6) the multiplier (1 − edge) / win_chance '
      + 'with the edge of the bet\'s tier in Duel\'s dice config (0.999 / win_chance at the 0.1% tier, '
      + 'the tier of every captured bet) and the payout amount_won = amount × multiplier',
  },
  {
    id: 'DICE-28', artifact: 'package.json + tests/verify.ts', coverage: 'full',
    note: 'npm test = mocha + verify (NO simulate): verify scores the pinned artifacts, re-derives '
      + 'the simulation statistics from the committed census, writes only to outputs/run/ and '
      + 'field-diffs at ATOL 1e-14 / RTOL 1e-12 — the pinned outputs/simulation-results.json is never '
      + 'rewritten by npm test. Regeneration is a separate npm run test:full (simulate writes to '
      + 'outputs/run/, then verify), so a fresh npm ci clone reproduces to Full Pass with the pinned '
      + 'artifacts untouched. Engines pinned to Node 22.x, audit ID PF-2026-DL02 assigned, and a '
      + 'dependency-free standalone verify.js (built from repo root via '
      + 'audit-framework/tools/build-standalone-verifier.mjs) runs the whole verdict under `node '
      + 'verify.js` with zero npm install',
  },
  {
    id: 'DICE-29', artifact: 'tests/mutations.json + scripts/mutate.mjs', coverage: 'full',
    note: 'a step-named mutation registry (49 entries) runs in a disposable copy via `npm run mutate`: '
      + '49/49 mutations killed and 21/21 scored steps have at least one mutation that kills them '
      + '(verified by the runner\'s own coverage gate, which reads the scored steps from the baseline '
      + 'run rather than assuming them). Each entry carries an `expect` marker so the INTENDED step '
      + 'fires, and includes a re-pin-class forgery (M12b doctors the dataset and disables the '
      + 'pre-flight abort so Step 12 must catch it on its own), a value-domain forgery (M12c sets '
      + 'an impossible scalar in the committed simulation artifact that Step 12\'s domain check '
      + 'rejects), the anti-circularity negative-control and lattice-enumeration guards of Step 13 '
      + '(M13b neuters the injected corruption, M13c mis-wires the enumeration tally), the '
      + 'Phase C bet-size-invariance coverage guard of Step 7 (M07b), the Step 5 recomputation-'
      + 'coverage guard (M05b drops a revealed seed so a bet cannot be recomputed — a shortfall vs '
      + 'expectedBets, no mismatch), the Step 8 outcome-range guard (M08b drives a roll below the '
      + 'declared range with the win flag left consistent), the Step 8 boundary/ceiling witness '
      + '(M08c doctors the census roll ceiling), the Step 18 stake-level (M18b) and direction-mode '
      + '(M18c) coverage guards, the simulation re-derivation guards (M16 forges the uniformity '
      + 'chi-squared; M17 forges one epoch\'s served-band return) and the informational live-fit '
      + 'step (M21 orders the captured rolls so Step 21 flags); added 2026-09-24: the Step 6 empty-seed '
      + 'control (M06b), one-1e-18-unit forgeries of a win credit (M07c) and a multiplier (M09b) that '
      + 'the former tolerances passed, the Step 7 stake-price comparison (M07d) and a byte-only change '
      + 'to a pinned artifact that only the Step 12 pin sees (M12d); added 2026-09-25 for Duel\'s own Verify-tab code '
      + '(DICE-09): M05c forges it AND re-pins it, M05d edits it without re-pinning, M05e breaks a src/rng.ts citation; added 2026-09-25 '
      + 'for the ProvablyFair.org player verifiers (DICE-24): M05f/M05g the docs-site derive.js forged-and-re-pinned / '
      + 'edited-without-re-pin, M05h/M05i/M05j the live-site chunk edited-without-re-pin / roll forged-and-re-pinned / '
      + 'printed seed hash forged-and-re-pinned; added 2026-10-14 for the RTP claim (Step 13): MC3a/MC3b '
      + 'miss the stated figure with the RTP table and record regenerated and must end RTP FIGURE OVERSTATED, '
      + 'exit 5, and MC3as/MC3bs make the same changes without regenerating the table and must end exit 1. '
      + 'No declared survivors',
  },
  {
    id: 'DICE-30', artifact: 'MANIFEST.md#limitations-and-trust + MANIFEST.md#evidence', coverage: 'full',
    note: 'MANIFEST.md carries the declared-limitations register (DL-1 … DL-15, each with a '
      + 'measured magnitude and closure evidence) and the load-bearing-premises table with the '
      + '"could the captured data contradict it?" column and ASSUMED markers; MANIFEST Evidence numbers '
      + 'every exhibit from E01 (E01–E14; E05 withdrawn as a duplicate of E04) with its evidential role and the dataset SHA-256; no '
      + 'internal QA material ships in the package',
  },
];

/** The block emitted alongside the step results. */
export function profileCoverageBlock(): Record<string, unknown> {
  return {
    game: PROFILE_GAME,
    profileVersion: PROFILE_VERSION,
    notApplicable: NOT_APPLICABLE,
    packageChecks: PACKAGE_CHECKS,
  };
}

/** The label fields for one scored step, to be merged into its emitted record. */
export function labelFor(step: number): Record<string, unknown> {
  const entry = STEP_CLAIMS[step];
  if (!entry) return { profileIds: [], profileChecks: [], profileNote: 'no mapping declared for this step' };
  return entry.claims.length
    ? { profileIds: entry.claims.map(c => c.id), profileChecks: entry.claims }
    : { profileIds: [], profileChecks: [], profileNote: entry.reason ?? 'no reason given' };
}
