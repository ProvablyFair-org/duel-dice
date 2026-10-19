/**
 * Duel.com Dice — FROZEN SIMULATION DESIGN.
 *
 * The Monte-Carlo experiment behind `outputs/simulation-results.json` is pinned and replayable:
 * its census (bin counts, win counts, per-epoch returns) is a deterministic function of the pinned
 * seeds and the dataset, so a re-run reproduces the counts byte-for-byte and the derived statistics
 * within the reproduction tolerance. These are the design parameters, single-sourced here so the
 * PRODUCER (`src/simulate.ts`) and the VERIFIER (`tests/steps/simulation.ts`) cannot pin different
 * experiments — the class of defect where the two sides of the same test silently disagree.
 *
 * The verifier RE-DERIVES every scored statistic from the census this file's shapes describe and
 * never trusts a p-value / RTP / z-score the artifact reports about itself; every sample depth is
 * required to EQUAL its constant here, so a cheap run cannot be presented as the deep one.
 */

// ── Significance, family-wise ──────────────────────────────────────────────────
// Pass 1 runs three screens (draw uniformity, lag-1 autocorrelation, runs). Judged individually at
// α each, the step's real false-positive rate on honest data is 1 − (1−α)³. Bonferroni-correcting
// each to α/3 holds the STEP's family-wise level at α.
export const ALPHA = 0.01;
export const ALPHA_SCREENS = 3;
export const ALPHA_SCREEN = ALPHA / ALPHA_SCREENS;

// ── Pass 1 — draw uniformity + serial independence ─────────────────────────────
export const SIM_UNIFORMITY_DRAWS = 2_000_000;   // ≥ 2,000,000 (DICE-20 floor)
export const SIM_UNIFORMITY_BINS  = 100;          // df = 99
export const SIM_SERIAL_DRAWS     = SIM_UNIFORMITY_DRAWS; // serial screens run on the same census

// ── Pass 1 — edge convergence on ≥9 target bands spanning both ends ────────────
// Ten 1,000,000-bet bands, targets 500…9500, spanning the high-win-chance and low-win-chance ends
// of the valid 1..9999 target space. Each band's WIN COUNT is the census; the verifier re-derives
// the win rate, the effective RTP and the goodness-of-fit chi-squared from it.
export const SIM_EDGE_BETS  = 1_000_000;          // ≥ 1,000,000 per band (DICE-20 floor)
export const SIM_EDGE_TARGETS: readonly number[] =
  Object.freeze([500, 1500, 2500, 3500, 4500, 5500, 6500, 7500, 8500, 9500]);
export const SIM_EDGE_BANDS = SIM_EDGE_TARGETS.length;   // 10 ≥ 9

// RTP-convergence marks captured across the edge bands (cross-band mean RTP at each mark).
export const SIM_CONVERGENCE_MARKS: readonly number[] =
  Object.freeze([10_000, 50_000, 100_000, 500_000, 1_000_000]);

export const THEORETICAL_RTP = 0.999;             // 99.9% — the 0.1% edge tier, flat across targets

// ── Pass 2 — cherry-pick, served-band payout-weighted return, exact per-bet moments + CLT tail ──
// Every revealed epoch is replayed over SIM_PASS2_NONCES nonces. The EARLY window is nonces
// 0 … EPOCH_SIZE-1 (the captured depth per epoch, not the captured nonce range: that is 0–50, nonce
// 50 occurring only in the 4 capture-retry epochs, DL-1); the REFERENCE window is the remainder.
// The statistic is the payout-weighted return of the bands the casino actually served in that
// epoch, standardized by the EXACT per-bet mean and variance of that return (a sum of independent
// scaled Bernoullis across the served bets — a scaled Poisson-binomial null), aggregated across
// epochs. The exact moments are used to standardize; the tail is a normal (CLT) approximation to
// the null, not its exact CDF.
export const SIM_PASS2_NONCES = 10_000;           // ≥ 10,000 nonces per revealed seed (DICE-21 floor)
export const SIM_PASS2_EARLY_WINDOW = 50;         // = EXPECTED_EPOCH_SIZE (captured depth)

// Pre-registered ONE-SIDED rule: an operator that cherry-picks a seed to short the player in the
// window the player actually saw drives the early return BELOW its fair expectation. So the test
// rejects on the LOWER tail of the aggregate return z at level ALPHA.
export const SIM_PASS2_ALPHA = ALPHA;
