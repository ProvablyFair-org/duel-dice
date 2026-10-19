# Duel Dice — Consolidated Audit Overview

**Audit ID:** PF-2026-DL02 · **Auditor:** ProvablyFair.org · **Release:** `v1.1.0` · **Framework:** 1.1

Game: Dice on [Duel.com](https://duel.com). Capture: **11 April 2026**, from `2026-04-11T13:21:47.568Z` to `2026-04-11T15:58:12.799Z`. Publication: 4 June 2026 (initial public release); this revision is release `v1.1.0`, the October 2026 re-certification (see [Release history](#release-history)). Runtime: Node 22.x (`package.json` `engines`, `.nvmrc`). Audit report: https://audit.provablyfair.org/casino/duel/games/dice/overview. This overview consolidates the package documentation. The machine-readable release identity remains in [RELEASE-MANIFEST.json](RELEASE-MANIFEST.json).

## Conclusion and scope

**PROVABLY FAIR — Full Pass, for the roll-over mode.** Every captured bet is a roll-over bet; Duel also offers roll-under, which was not captured and is not covered (DL-14). Of 21 scored verification steps, 20 PASS and 1 is a capture-origin FLAG (Step 4: four capture-retry nonce gaps reconstructed via commit-reveal, disclosed and verdict-neutral, DL-1). There are 0 hard fails and 0 verdict-affecting flags. Every result in the 6,700-bet dataset was reproduced from (serverSeed, clientSeed, nonce) using HMAC-SHA256 with RANGE=10001 rejection sampling, by `src/rng.ts`, which was ported from Duel's published Verify-tab code (E13), and by that code itself, run unmodified, to the exact `0..10000` lattice value, with 0 mismatches. 138/138 next-seed promotions link.

**Theoretical RTP is 99.9000% (house edge 0.1%) identically at every integer roll-over target 1..9,999 in the 0.1% edge tier**, proven analytically and consistent with the simulation. The identity `win_chance × multiplier = 0.999` holds for every possible roll-over target in that tier, a flat 0.1% house edge by construction. Every captured bet is in the 0.1% tier. Above it, the duel.com dice config as fetched 2026-10-05 in a logged-in session (read-only GET) raises the edge with stake, as described under [Scaling edge](#scaling-edge). Win condition, multiplier and win chance were verified for all 6,700 bets. Empirical RTP over the 6,700 bets is 83.9856%; a sample this size cannot resolve a 0.1% edge in a game whose top targets pay ~10,000×, so it is variance illustration, not RTP evidence (DL-9).

Remaining limitations from the original conclusion: multi-account seed sharing was not tested (single-account audit scope), and without drand integration seed cherry-picking is theoretically possible, though no statistical evidence was found in this dataset. Both are structural properties of the commit-reveal scheme, not defects. In addition, the roll-under mode is not audited: the capture holds no roll-under bet (DL-14), and Duel's scaled edge tiers above 0.1% are not audited: no captured bet is on one (DL-15). The full register (DL-1 … DL-15) and the load-bearing premises are in [Limitations and trust](#limitations-and-trust).

## Contents

- [Dataset and capture](#dataset-and-capture)
- [Game and algorithm](#game-and-algorithm)
- [Payouts and RTP](#payouts-and-rtp)
- [Verification results](#verification-results)
- [Reproduce the audit](#reproduce-the-audit)
- [Verify a bet](#verify-a-bet)
- [Evidence](#evidence)
- [Limitations and trust](#limitations-and-trust)
- [Terms](#terms)
- [Release history](#release-history)

## Dataset and capture

Live bet data was collected via browser session interception during active play on Duel.com Dice, using a test account funded by ProvablyFair.org. API responses were recorded in four structured phases:

| Phase | Bets | Stake | Target | Purpose |
|-------|------|-------|--------|---------|
| A | 5,000 | $0.01 | Random (200–9998) | Baseline — full target range coverage (3,860 distinct targets) |
| B | 1,000 | $0.01 | 9800 (fixed) | High-target statistical validation |
| C | 200 | $10.00 | 9700 (fixed) | High-stake payout verification |
| D | 500 | $0.01 | 9700 (fixed) | Custom client seed variation test, 10 player-set client seeds [E11] |

Each bet record stores the full request payload (`amount`, `bet_type`, `target`) and response (`result`, `is_win`, `multiplier`, `amount_won`, `win_chance`), along with the associated seed commitment (`server_seed_hashed`, `client_seed`, `nonce`).

| Metric | Value |
|--------|-------|
| Seed entries | 138 records; 134 commitments revealed, covering every epoch with bets (Step 1) |
| Epochs (50 bets each) | 134 |
| Next-seed promotions | 138/138 verified |
| Forward chain links | 137/137 verified |
| Nonce range observed | 0–50 (nonce 50 only in the 4 capture-retry epochs, DL-1) |
| Hash mismatches | 0 |

A seed commitment snapshot was recorded immediately after each rotation and before the first bet of each epoch: for all 134 epochs with bets, the capture timestamp of the seed record carrying the epoch's active commitment precedes the epoch's first bet (measured for this release, not scored). This capture record, not the hash match, is the evidence that each commitment was shown before its bets, and it holds only as far as the capture is a faithful record of what Duel served (DL-4, DL-11).

One value in the seed records is not the capture script's output: the plaintext on `seeds[0]` (epoch 0's own seed) was copied from `seeds[1]`, which revealed it from transaction 519926108, by a step outside the capture script that is not recorded in this package; the reference script writes the first rotation with `serverSeed: null`, because no bet precedes it to reveal a seed from (`capture/capture-auto.reference.js` lines 304 and 316–319). The `at` on `seeds[0]` (13:21:49.597Z) dates its commitment, not that plaintext, which the capture first recorded on `seeds[1]` at 13:22:33.343Z; Step 1 counts the row among the 138 that carry a plaintext, but no step hashes or replays the copy on `seeds[0]`: Step 1 and the bet replays take epoch 0's seed from `seeds[1]`.

| Input | SHA-256 |
|-------|---------|
| [data/dice-master-6700bets.json](data/dice-master-6700bets.json) | `3550ffca07a6f7825f96cdd4e3d8c3cd57898b5b5238b9739753a754cff056d6` |

The population (bet, seed, phase and epoch counts) is bound to code constants in `src/loader.ts`, not to the dataset header. The verification suite checks the hash at startup and aborts on mismatch. The capture method is preserved as [capture/capture-auto.reference.js](capture/capture-auto.reference.js), a reference record and not a runnable tool. Its `generateClientSeed()` draws the Phase A–C client seeds from `Math.random()` (DL-2); Phase D used `'pfaudit'` + `Date.now().toString(36)` (DL-3).

The `capture/` directory holds four more files:

| File | What it is |
|------|------------|
| [capture/capture-auto.js](capture/capture-auto.js) | The runnable browser-console capture script (v3, IndexedDB, `dice.go()` / `dice.save()`), unchanged since it was added to this repository. It writes schema `duel-dice-capture-v3`, the dataset's `meta.schema`, and [CAPTURE-PLAN.md](capture/CAPTURE-PLAN.md) names it as the script behind the dataset. `capture-auto.reference.js` is this file with its banner and its console controls (`go`, `pause`, `save`, `status`, `clear`) removed; every other line is identical, two lines further down in `capture-auto.js` (the reference line numbers this overview cites are lines n + 2 there). |
| [capture/capture-v2.js](capture/capture-v2.js) | The next-capture script (v4, schema `duel-dice-capture-v4`), written 2026-09-25 and not run against duel.com: no v4 dataset is in this package. It draws every client seed and Phase A target from `crypto.getRandomValues` (DICE-06, DL-2, DL-3) and moves Phase C to 300 × $10 at target 5000 (DICE-12). It plays no part in the verdict. |
| [capture/capture-v2.test.js](capture/capture-v2.test.js) | Offline unit test of `capture-v2.js`'s pure helpers, no network: `node --test capture/capture-v2.test.js` (12 tests). It is not part of `npm test`. |
| [capture/CAPTURE-PLAN.md](capture/CAPTURE-PLAN.md) | The plan for that next capture: the checks it closes, 136 epochs of 50 bets (6,800), estimated duration and cost, and the verifier changes needed when its dataset lands. |

## Game and algorithm

Duel Dice offers two directions: the player selects a target and bets that the dice result will be **over** (greater than) or **under** the target ([E10](#evidence) shows a settled roll-under bet). This audit covers `bet_type = "over"` only: every one of the 6,700 captured bets is a roll-over bet, and roll-under is not covered (DL-14). The result is a randomly generated integer in the range [0, 10000].

| Parameter | Description | Range |
|-----------|-------------|-------|
| `target` | The threshold value | 200–9998 (observed in dataset) |
| `bet_type` | Direction of bet | `"over"` (result must exceed target), the only value in the capture; Duel's roll-under mode is not covered |
| `amount` | Bet stake in USD | Any positive amount |

1. The platform computes a dice result integer `r ∈ [0, 10000]` using the provably fair RNG.
2. **Win condition:** `r > target` (strict; a result equal to the target is a loss).
3. **Win payout:** `amount_won = amount × multiplier`.
4. **Loss payout:** `amount_won = 0`.

The display layer shows `target / 100` and `result / 100`; every integer in this package is the lattice value, not the display value.

### Draw

```
key       = hexDecode(serverSeed)
message   = clientSeed + ":" + nonce
hmac      = HMAC-SHA256(key, message)                  // 64 hex chars = 32 bytes

RANGE     = 10001
MAX_U32   = 0xFFFFFFFF
MAX_FAIR  = MAX_U32 − (MAX_U32 % RANGE)                // largest multiple of RANGE ≤ MAX_U32

// scan 4-byte (8 hex-char) chunks left-to-right; accept first chunk < MAX_FAIR
for off in 0, 8, 16, ..., 56:
  chunk = parseInt(hmac[off..off+8], 16)               // uint32 (0..2^32−1)
  if chunk < MAX_FAIR:
    result = chunk % RANGE                             // integer in [0, 10000]
    break

win              = result > target                     // integer comparison; "roll-over" direction
displayedRoll    = result / 100                        // 0.00 to 100.00 (UI only)
displayedTarget  = target / 100                        // UI only
payout           = bet × payoutMultiplier(target)      // edge factor 0.999 at the 0.1% tier
```

The HMAC key is the hex-decoded server seed, **not** the UTF-8 string. This was confirmed empirically: `Buffer.from(serverSeed, 'utf-8')` as the key produces different results for all 7 test vectors, and the hex-decoded key is the only encoding that matches the live API. The server seed is always a 64-character hex string encoding 32 bytes. The commitment is `SHA-256(hex_bytes(serverSeed)) == server_seed_hashed`. The nonce is 0-indexed within an epoch, the bets under one seed pair until the player rotates it; this capture rotated after every 50 logged bets.

Rejection sampling removes the modulo bias a naive `chunk % RANGE` would introduce, since `2^32` is not a multiple of `10001`. Step 19 computes the bound from the same constants the draw reads: `MAX_FAIR = 10001 × 429453 = 4294959453` is an exact whole number of ranges, so each of the 10,001 residues receives exactly 429,453 of the accepted uint32 values and the worst-case modulo bias is **0**, inside the framework's `2^-32` ceiling. 7,843 of the 2^32 chunk values fall in the discarded tail (per-chunk rejection ≈ 1.83×10⁻⁶). If all eight chunks were rejected the code throws an error, which would surface as an auditable failure; this did not occur in the 6,700 tested bets.

All 6,700 bets have `drand_round: null` and `drand_randomness: null`. The RNG is self-contained and does not depend on any external randomness beacon; Step 5 reproduces every result from (serverSeed, clientSeed, nonce) alone.

Duel publishes the algorithm as source: the Dice tab of duel.com → Provably Fair → Verify carries a JavaScript code panel (E03 shows it collapsed). The auditor copied it verbatim on 2026-09-25 (Expand → Copy) as E13. The RNG code in `src/rng.ts` was ported from this published code, so it is not a separate implementation written from the specification alone: its header records the port, and v1.0.0's header gave its source as duel.com/fairness/verify. `src/rng.ts` cites 12 of its lines, each checked verbatim against the pinned file, and Step 5 executes the file itself, unmodified, on all 6,700 bets: its displayed roll (`((value % 10001) / 100).toString()`) equals the served roll on every bet once mapped onto the `0..10000` lattice. The algorithm also matches a prior Duel.com audit (`winna/dueldice`) that implemented the same RANGE=10001 rejection-sampling logic. Live bet data was used to verify formula parameters to machine precision. Not established: that the live Verify button, or Duel's server, runs exactly this code.

| Vector | serverSeed (first 8) | clientSeed | nonce | API result | Computed | Match |
|--------|----------------------|------------|-------|------------|----------|-------|
| 1 | `52855503` | `bRNvtSn0hp2uVFRe` | 0 | 4234 | 4234 | ✓ |
| 2 | `52855503` | `bRNvtSn0hp2uVFRe` | 1 | 9793 | 9793 | ✓ |
| 3 | `52855503` | `bRNvtSn0hp2uVFRe` | 2 | 8187 | 8187 | ✓ |
| 4 | `52855503` | `bRNvtSn0hp2uVFRe` | 3 | 4345 | 4345 | ✓ |
| 5 | `52855503` | `bRNvtSn0hp2uVFRe` | 4 | 6712 | 6712 | ✓ |
| 6 | `52855503` | `bRNvtSn0hp2uVFRe` | 5 | 6900 | 6900 | ✓ |
| 7 | `52855503` | `bRNvtSn0hp2uVFRe` | 6 | 2790 | 2790 | ✓ |

### Bet flow and seed lifecycle

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/v2/client-seed` | Fetch current seed commitment (`serverSeedHashed`, `clientSeed`, `nonce`) |
| `POST` | `/api/v2/dice/bet` | Place a bet (`amount`, `currency`, `bet_type`, `target`); returns `result`, `is_win`, `amount_won`, `multiplier`, `win_chance`, `nonce`, `server_seed_hashed` |
| `POST` | `/api/v2/client-seed/rotate` | Rotate seeds (reveals previous server seed) |
| `GET` | `/api/v2/user/transactions/{txId}` | Retrieve revealed server seed post-rotation |

1. Before placing any bet, the player sees the `server_seed_hashed` (SHA-256 commitment). The raw seed is withheld until the player rotates the seed pair, which ends the epoch.
2. Bets are placed using the current `client_seed` and an incrementing `nonce` from 0; each nonce gives a unique RNG output under the same seeds. The captured nonce range is 0–50: 130 epochs hold nonces 0–49, and in the 4 capture-retry epochs the capture recorded nonce 50 and missed one nonce below it (DL-1).
3. When the player rotates the seed pair (`POST /api/v2/client-seed/rotate`), the previous `server_seed` is revealed and the nonce resets to 0. Duel did not rotate at 50 bets: the 50-bet epochs in this dataset are the capture's rotation schedule (`BETS_PER_EPOCH = 50`, `capture/capture-auto.reference.js` lines 21 and 362), and in the 4 capture-retry epochs Duel served nonce 50 under the same seed (DL-1).
4. Players can verify any bet by computing `HMAC-SHA256(hex_decode(serverSeed), clientSeed:nonce)` and confirming the result matches the recorded outcome.

| Property | Implementation |
|----------|----------------|
| Unpredictability | Server seed withheld until epoch end |
| Player influence | Client seed included in HMAC message |
| Non-repudiation | Commitment hash published pre-bet |
| Auditability | All seeds revealed post-epoch; full replay possible |
| Bias elimination | Rejection sampling with RANGE=10001 |
| No external dependency | drand_round=null in all 6,700 bets |

Duel.com's fairness modal and `/api/v2/client-seed` API both display a "Next server seed (Hashed)": a pre-commitment to the server seed used after the player rotates. Step 2 recomputes each rotation from raw hex (the hash the server had outstanding as "next" must be the one it actually activated) and walks the forward chain, requiring `seeds[i].nextServerSeedHash` to equal `seeds[i+1].serverSeedHashed` at every one of the 137 transitions. The rotation check shows that each activated hash is the one the capture had recorded as outstanding "next"; the chain shows that the records fit one activation ORDER. Both are consistency checks: they show the seed records fit together, not when each hash was shown. That each "next" hash was shown before the epoch it opened rests on the capture having recorded it at the earlier rotation (DL-4). Step 2 also requires the pre-capture link: the first epoch's hash was recorded as outstanding "next" at the capture's first observation, so in the capture record the opening epoch was not chosen after watching began. Result: 138/138 promotions recomputed from raw hex, 0 promotion mismatches, 137/137 forward links, pre-capture link present. Per the audit framework, a mismatch on next-seed promotion is a HARD_FAIL; it would indicate the server generates seeds at rotation time after seeing the player's client seed.

### Client seed origin

The client seed displayed in the Provably Fair panel is generated by the player's browser before any bet is placed. On rotation the browser submits the new client seed via `POST /api/v2/client-seed/rotate`. The server's response contains only the new `server_seed_hashed` commitment, the `next_server_seed_hash`, the echoed `client_seed` (the value the client submitted) and the reset `nonce` [E11]. The server does not generate or assign the client seed. It commits to `server_seed_hashed` for the new epoch before the player's client seed for that epoch is finalized, and the player can rotate to any client seed at any time. E12 shows the default generator in the live JS bundle: a rejection-sampled `crypto.getRandomValues` (browser CSPRNG). The auditor's own Phase A–C capture seeds are the separate `Math.random()` disclosure in DL-2.

| Property | Result |
|----------|--------|
| Client seed generated by | Browser (client-side) |
| Player can change client seed | Yes — via seed rotation UI |
| Server commits before client seed is known | Yes — `server_seed_hashed` is published at rotation, before the next epoch's client seed is set |
| Client seed visible in server rotation response | Echoed back as confirmation (client-submitted value, not server-assigned) |
| **Verdict** | **Full Pass** |

### Player verifiers

Two ProvablyFair.org verifiers are run from SHA-256-pinned byte copies on all 6,700 captured bets (Step 5, DICE-24). The live page **www.provablyfair.org/verify-bets** (Casino = Duel.com, Game = Dice) returns the roll and the server-seed hash: 6,700 / 6,700 rolls equal the served roll and 6,700 / 6,700 hashes equal the served commitment; it does not compute the win flag or the multiplier. The docs-site verifier (VerifyBets `games/dice/derive.js`, site `main` @ bd4d59c) also returns the win flag, win chance and multiplier: 6,700 / 6,700 rolls and win flags equal the served ones. Its multiplier is `0.999 / winChance` (`derive.js` line 85), the 0.1% tier's price, so it does not apply to a bet on a scaled edge tier (DL-15). It displays the multiplier to 4 decimals: on 2 of the 2,519 captured wins (served 67.50675 and 3.64635, each exactly on a 4-decimal half) it shows the lower last digit, because the nearest double to those values lies just below them. Duel's own Verify tab code (E13) computes the roll too and agrees on 6,700 / 6,700.

## Payouts and RTP

Every formula and figure in this section is for roll-over bets, the only mode captured (DL-14), and, outside [Scaling edge](#scaling-edge), for Duel's 0.1% edge tier, which holds every captured bet (DL-15).

### Win chance, multiplier and house edge

```
win_chance = (10000 − target) / 10001
multiplier = 0.999 / win_chance                 // 0.1% tier
           = 0.999 × 10001 / (10000 − target)
```

In the 0.1% tier the payout multiplier is derived from the published edge factor (0.999, a 0.1% house edge, flat across targets in that tier) and the survival probability `(10000 − target) / 10001`, with no operator-supplied table and no operator odds field read. The edge comes entirely from the 0.999 factor. RANGE = 10001 sets the win chance, `(10000 − t) / 10001` rather than `(10000 − t) / 10000`, but the multiplier is computed from that same win chance, so RANGE cancels out of the RTP:

```
win_chance × multiplier = win_chance × 0.999 / win_chance = 0.999
```

All 6,700 served multipliers equal `999·10001 / (1000·(10000 − target))` (Step 9), which closes the loop at 99.9% RTP regardless of target within the 0.1% tier. Within that tier the edge is flat across targets, transparent and consistent with standard provably fair dice implementations. Across stakes the edge in Duel's dice config (E14) is not flat: see [Scaling edge](#scaling-edge); which tier Duel's server applies above the 0.1% tier is not verified (DL-15).

| Target | Win Chance | Multiplier | RTP |
|--------|-----------|------------|-----|
| 200 | 9800/10001 = 97.9902% | 1.019489693877551020× (served) | 99.9000% |
| 2000 | 79.9920% | 1.248874875× (exact) | 99.9000% |
| 5000 | 49.9950% | 1.9981998× (exact) | 99.9000% |
| 9000 | 9.9990% | 9.990999× (exact; served `9.990999000000000000`) | 99.9000% |
| 9800 | 1.9998% | 49.9550× | 99.9000% |
| 9900 | 0.9999% | 99.9100× | 99.9000% |
| 9998 | 2/10001 = 0.0200% | 4995.499500000000000000× (served) | 99.9000% |

Targets observed in the dataset run from 200 to 9998 (Phase A; 57 of its 5,000 bets are above 9900). The multiplier at target 9998 (4995.4995×) is the highest in the observed target range; no overflow or precision issues were found.

### Scaling edge

In the duel.com dice config, `GET /api/v2/dice/config`, as fetched 2026-10-05 in a logged-in session (read-only GET), Duel scales the dice edge with stake. The response is pinned here byte for byte as [E14](#evidence), and every E14 figure in this section is printed by `node scripts/dice-config-tiers.mjs`. Its `scaling_edge` object holds 122 ranges with 10,712 stake tiers in all. Every tier has the same five fields, `id`, `config_id`, `min_bet`, `max_bet` and `house_edge`, with `config_id` 2 on all 10,712. Each range's key and its `range_to` bound a band of `10000 − target` values, the winning rolls of a roll-over bet: the range keyed 2 is target 9,998 alone, and the 122 ranges cover targets 2 to 9,998 with no gap. This audit reads a bet's range as the one with key ≤ `10000 − target` ≤ `range_to`; the config does not say how Duel's server picks it.

- **Shape (E14).** In every range the first tier starts at $0 with a 0.1% edge, and each further tier adds 0.01%, with no gap or overlap between tiers. 114 ranges have 91 tiers and end at 1.0%. In the 8 ranges for targets 2 to 799 the $3m max bet ends the ladder first: they have 2 to 84 tiers and top out between 0.11% (targets 2–99) and 0.93% (targets 700–799). No tier's edge is below 0.1% or above 1.0%.
- **Rule (E14's arithmetic).** E14 holds no multiplier and no formula, only stake bounds and an edge per tier. Taking the win chance at the range's longest odds (key / 10001) and pricing with `multiplier = (1 − edge) / win_chance`, each tier's `max_bet` gives a potential profit of about $25m × the tier's edge: the implied bankroll is $24,990,601.97 to $25,010,108.95 on all 10,704 tiers below the $3m cap. Priced at `0.999 / win_chance` instead, the same tiers imply $24,993,104.29 to $27,895,807.40. So E14's tier boundaries fit `(1 − edge) / win_chance`, under which RTP at a tier is `1 − edge`; that the served multiplier follows it above the 0.1% tier is not verified (DL-15). Under the same reading, the other targets in a range reach the next tier at a potential profit below $25m × edge, because the boundaries fit the range's longest odds.
- **Examples (E14).** The range is the one holding `10000 − target`.

  | Target (win chance) | Range | 0.1% up to | 1.0% from | Max bet (top edge) |
  |---|---|---|---|---|
  | 9,998 (0.0200%) | 2 | $5.01 | $50.00 | $50.51 (1.0%) |
  | 9,900 (0.9999%) | 91–100 | $229.80 | $2,295.64 | $2,319.06 (1.0%) |
  | 9,800 (1.9998%), Phase B | 181–200 | $461.26 | $4,608.33 | $4,655.35 (1.0%) |
  | 9,700 (2.9997%), Phases C and D | 251–300 | $644.25 | $6,436.91 | $6,502.60 (1.0%) |
  | 9,000 (9.9990%) | 901–1,000 | $2,478.00 | $24,774.77 | $25,027.81 (1.0%) |
  | 5,000 (49.9950%) | 4,901–5,000 | $24,071.71 | $242,551.47 | $245,050.49 (1.0%) |
  | 1,000 (89.9910%) | 8,901–9,000 | $204,151.56 | $2,200,818.47 | $2,225,272.25 (1.0%) |
  | 100 (98.9901%) | 9,801–9,900 | $1,289,612.05 | none | $3,000,000 (0.22%) |
  | 2 (99.9700%) | 9,901–9,998 | $2,750,308.34 | none | $3,000,000 (0.11%) |

- **The capture.** Every captured bet was in the 0.1% tier when it was placed: `effective_edge` is 0.1 in the captured bet-time response on 6,700 / 6,700 bets, and every served multiplier equals `0.999 / win_chance` (Step 9). Read against E14, every captured stake would also be in its range's 0.1% tier (6,700 / 6,700). The closest are the 200 Phase C bets, $10 at target 9,700 (potential profit $323.03), at 1.55% of that range's $644.25 ceiling. E14 was fetched 177 days after the capture (2026-04-11); the config in force at capture time is not in this package.
- **Not verified here:** any multiplier, payout or RTP above the 0.1% tier (DL-15), and how Duel's server assigns a bet to a range and tier.

### Settlement checks

**Step 7, payout math.** Every served money figure is a decimal string with at most 18 fractional digits, so it is an integer count of `1e-18` units. Step 7 parses each string to that integer (BigInt, no floating point) and compares **exactly, with no tolerance**:

```
if is_win:  amount_won == round_nearest_1e-18( amount × 999·10001 / (1000·(10000 − target)) )   (declared settlement rule)
            |amount_won − amount × multiplier| ≤ ½ × 1e-18                                         (payout = amount × served multiplier, on the grid)
if not win: amount_won == 0                                                                       (exactly 0 units)
```

The settlement rule was measured on the capture before it was adopted: rounding `amount × the served multiplier` to the nearest unit disagrees by one unit on 16 wins (the product lands on an exact half in 26 wins), and a half-down rule on it disagrees on 10; stake × the **exact formula** multiplier, rounded to the nearest unit, fits all 2,519 wins. The capture holds no exact tie under that rule, so the direction a tie would round is unwitnessed. A served string that is not a plain decimal with ≤ 18 fractional digits cannot be on the grid and is counted as an error. This replaces a relative tolerance of `1e-12` on parsed doubles, which, floored at `max(|x|, 1)`, was an absolute `1e-12` on every credit below 1, up to 10^6 grid units.

Worked example (bet 50120996, target 4253, stake 0.01): 0.01 × 9990999/5747000 = 0.017384720723855924830… → nearest 1e-18 unit `0.017384720723855925`, served `0.017384720723855925`.

Result: 6,700/6,700 bets, **0 errors** (2,519 wins, 4,181 losses).

**Bet-size invariance (Phase C).** All 200 Phase C bets at stake 10 recompute to their recorded roll; Phase C and the 500 base-stake (0.01) bets at the same target 9,700 are served one multiplier value; the 5 Phase C wins (each credited `333.0333`) settle by the same exact rule. The engine takes no wager argument, so the roll does not depend on stake. In Duel's dice config stake selects the edge tier ([Scaling edge](#scaling-edge)); which tier Duel's server applies above the 0.1% tier is not verified (DL-15). Phase C at $10 / target 9,700 sits inside the 0.1% tier: in E14 (the duel.com dice config as fetched 2026-10-05 in a logged-in session, read-only GET) the range holding target 9,700 (251–300) has its 0.1% tier up to $644.25. So Phase C shows the same price at both stakes within the 0.1% tier only. The profile's floor of ≥ 100 elevated-stake wins is **not met**: 5 witnesses, disclosed as DL-6.

**Step 8, win condition.** `result > target` was computed for every bet and compared with the API `is_win` field: 6,700/6,700, 0 errors; every recorded roll is an integer inside [0, 10000].

| Bet ID | result | target | result > target | is_win (API) | Match |
|--------|--------|--------|-----------------|--------------|-------|
| 50120986 | 4234 | 9313 | false | false | ✓ |
| 50120996 | 9793 | 4253 | true | true | ✓ |
| 50121005 | 8187 | 1831 | true | true | ✓ |
| 50121011 | 4345 | 6990 | false | false | ✓ |

**Step 9, multiplier formula.** The formula is the exact rational `999·10001 / (1000·(10000 − target))`. Each served 18-dp multiplier is parsed to integer `1e-18` units and must **equal** that rational rounded to the nearest unit: integer equality, no tolerance (the former check allowed `1e-6`, i.e. 10^12 grid units). All 6,700 match; the capture holds no exact tie, so the tie direction is unwitnessed.

| Target | Expected Multiplier | API Multiplier | Δ (1e-18 units) |
|--------|---------------------|----------------|---|
| 9313 | 14.542938... | `14.542938864628820961` | 0 |
| 4253 | 1.738472... | `1.738472072385592483` | 0 |
| 9800 | 49.954995... | `49.954995000000000000` | 0 |
| 9700 | 33.303330... | `33.303330000000000000` | 0 |

**Step 10, win chance formula.** All 6,700 API `win_chance` string values match `(10000 − target) / 10001` to within 1e-14 (14 decimal places). Spot check: target=8800, expected = 1200/10001 = `0.119988001199880012`, API = `0.119988001199880012`, exact match.

### Theoretical RTP

The theoretical RTP is computed from first principles using only the published payout formulas, without any casino-supplied probability field. For any target `t` and a bet's edge tier `edge`:

```
win_chance = (10000 − t) / 10001
multiplier = (1 − edge) / win_chance

RTP = win_chance × multiplier
    = 1 − edge
    = 0.999   (exactly, for all t, in the 0.1% tier)
```

This identity holds analytically; no live data is required to establish it. Step 13 proves it for the 0.1% tier, which holds every captured bet, at all 9,999 valid targets (maximum deviation from 99.9% is `1.11e-16`, within the `1e-4` bound). At the scaled tiers `RTP = 1 − edge` assumes the `(1 − edge) / win_chance` multiplier. E14's tier boundaries are consistent with that multiplier ([Scaling edge](#scaling-edge)), but no captured bet is on a scaled tier, so it is not verified (DL-15). Because the identity is algebraically trivial, it is not on its own the anti-circularity evidence. The load-bearing content is that the win probability is derived from the lattice and the win rule alone: the closed-form win chance is cross-checked against a **literal 10,001-point tally** over the `0..10000` grid on all **3,862 distinct targets the dataset served** (0 mismatches; an independent enumeration that cannot share a scaling or off-by-one error with the closed form), together with an **injected-corruption negative control** that confirms a corrupted roll and a non-numeric value are rejected by the same exact-equality predicate Step 5 uses, while the true recomputed roll is accepted. No roll-over target carries a negative edge: player-favourable bets in the capture are 0, and none is possible on the valid roll-over target band (S5-D1).

`outputs/rtp-claim-table.json` scores every integer target from 2 to 9,998 (roll over) in the 0.1% edge tier against a flat 99.9% claim (Duel's fairness page: payout multiplier = 0.999 / win chance) and prints the outcome. The rule (RTP-CLAIM 1.2.0, Methodology v1.1) is switched on (`src/rtp-claim-switch.ts`, decision D3 of 14 October 2026): the outcome is scored on Step 13, the step carrying DICE-19, and a house-side miss would make the verdict RTP FIGURE OVERSTATED (exit 5), never NOT PROVABLY FAIR, because the draws themselves pass. The fairness page is one of the rule's six places a figure can be shown (game page, fairness page, help page, bet panel, rules, game settings). Outcome: pass (true minimum 99.900000%, true maximum 99.900000%; 0 of 9,997 targets beyond the 0.1 pp band). The scaled tiers are not scored (DL-15).

### Empirical RTP and simulation

| Phase | Wagered | RTP |
|-------|---------|-----|
| A | $50 | 103.304% |
| B | $10 | 124.887% |
| C | $2,000 | 83.258% |
| D | $5 | 99.910% |
| **Total** | **$2,065** | 83.9856% over the 6,700 bets |

Phase A uses random targets spread across 200–9998, weighted toward high-risk targets. Phases B, C and D use target 9700–9800, near-maximum targets with ~2–3% win chance. Over any short period the empirical RTP of high-variance bets deviates enormously from theoretical; the empirical variation is consistent with variance expectations for a 6,700-bet sample at low win probabilities. The analytical 99.9% is the authoritative figure.

Pass 1 is a dedicated 2,000,000-draw uniformity census (chi²=99.151, df=99, p=0.477; the draw spans the full lattice [0, 10000]) plus edge convergence on 10 target bands spanning both ends of 1..9999 at 1,000,000 bets each. All 10 bands lie within 5·SE of the flat 0.999; mean simulated RTP is **99.761%** (theoretical 99.9%). Serial independence: lag-1 z=2.643 and Wald–Wolfowitz runs z=-2.034, both inside the family-wise (Bonferroni α/3) screen. The statistics are re-derived in verify from the stored census (histogram counts, win counts), not read from the artifact's scalars (DL-7 names the one exception). Pass 2 is described under [Verification results](#verification-results) and in [Limitations and trust](#limitations-and-trust).

## Verification results

The suite scores 21 steps on the 6,700 captured bets: **20 PASS, 1 capture-origin FLAG, 0 hard fails**, verdict PROVABLY FAIR — Full Pass. The profile check each step implements is declared in `src/profile-map.ts` and emitted beside the step results in `outputs/verification-results.json`.

| # | Check | Result | Finding |
|---|-------|--------|---------|
| **Commit-Reveal Integrity** | | | |
| 1 | Seed hash integrity | PASS | 134 of the 137 rotation transitions required by `src/loader.ts` verified by SHA-256; 3 phase-boundary transitions excluded; 0 seed rows without plaintext (the plaintext on `seeds[0]` was copied from `seeds[1]` outside the capture script, [Dataset and capture](#dataset-and-capture)) |
| 2 | Next-seed promotion + forward commitment chain | PASS | 138/138 rotations recomputed from raw hex; 137/137 forward links verified (`seeds[i].nextServerSeedHash === seeds[i+1].serverSeedHashed`); pre-capture link present — the records chain in one epoch order, not just one membership; consistency checks, not timing, which rests on the capture's pre-bet observations (DL-4) |
| 3 | Hash consistency within epoch | PASS | 134 distinct epochs; 0 orphan hashes |
| 4 | Nonce audit | FLAG (capture-origin, verdict-neutral) | 134 epochs: nonces otherwise sequential 0–49, single client seed per epoch; 4 capture-retry epochs each missed exactly one nonce live and were reconstructed from the revealed seed whose SHA-256 matches the commitment the capture recorded before that epoch's first bet (0 unverifiable) — disclosed as DL-1, not scored PASS, does not move the verdict |
| **RNG Determinism** | | | |
| 5 | Result recomputation + drand absent | PASS | 6,700/6,700 results recomputed by exact integer equality on the 0..10000 lattice; 0 mismatches, 0 skipped — coverage equals the audited population `expectedBets`=6,700 (a bet that cannot be recomputed is a FAIL, not an exclusion); Duel's own Verify-tab code and both ProvablyFair.org player verifiers (docs-site `derive.js` @ main bd4d59c and the live www.provablyfair.org/verify-bets bundle, vendored and hash-pinned) executed on all 6,700 bets reproduce every roll — 0 differ |
| 6 | Client seed influence | PASS | Wrong client seed on 5 bets from each of the 134 epochs changes 670/670 rolls — 0 collisions against the lattice bound E + 5σ + 1 = 2.36 (E = 670/10001); empty-seed control (clientSeed = "") over all 6,700 bets: 1 collision, bound 5.76 |
| **Payout Verification** | | | |
| 7 | Payout math | PASS | 6,700/6,700: compared exactly on the served 1e-18 grid (integer units, no tolerance) — every win equals the nearest unit of stake × 0.999·10001/(10000 − target) (0.1% tier; every captured bet) and lies within ½ unit of amount × served multiplier, every loss credits exactly 0; 200/200 Phase C elevated-stake bets recompute identically, engine takes no wager argument (the roll does not depend on stake; in Duel's dice config (E14) stake selects the edge tier, which is not verified above the 0.1% tier (DL-15), and both captured stakes are in the 0.1% tier), Phase C priced the same as the base stake at target 9,700 (5 elevated-stake wins vs the 100-win floor — DL-6) |
| 8 | Win condition & outcome range | PASS | 6,700/6,700: is_win = (result > target), 0 errors; every recorded roll an integer inside the declared range [0, 10000], 0 out of range |
| 9 | Multiplier formula | PASS | 0.999 / ((10000−target)/10001) (0.1% tier; every captured bet) rounded to the nearest 1e-18 unit, integer equality with the served 18-dp string (no tolerance); 0 mismatches |
| 10 | Win chance formula | PASS | (10000−target)/10001 exact to 14 decimal places |
| **Dataset Integrity** | | | |
| 11 | Population & phase labels | PASS | 6,700 bets and 138 seed records match the capture plan in `src/loader.ts` (code constants, not the dataset header); phases A, B, C, D present; last bet phase=D |
| 12 | Dataset hash & artifact value domains | PASS | Dataset SHA-256 `3550ffca…056d6`; every numeric leaf of the committed statistical artifacts within a src-derived value domain (both directions: every leaf in domain, every leaf covered); 4 artifacts of record match their SHA-256 pins in `src/artifact-pins.ts` and carry no run metadata |
| 13 | Anti-circularity (win probability from the lattice + negative control) | PASS | Closed-form win chance cross-checked against a literal 10,001-point lattice tally on all 3,862 distinct served targets (0 mismatches); injected-corruption negative control rejects a corrupted roll and a NaN while accepting the true roll; RTP = win_chance × multiplier = 99.9000% within the 1e-4 bound at all 9,999 targets (measured deviation 1.11e-16, in the step's data block) |
| 14 | Epoch size | PASS | 134 epochs as declared in `src/loader.ts`, each of exactly 50 bets |
| 15 | Phase D client seed variation | PASS | 500 bets; 10 distinct client seeds; target 9700; recomputation 500/500 |
| **Simulation Integrity** | | | |
| 16 | Simulation Pass 1 integrity | PASS | 2M-draw uniformity census (chi²=99.151, df=99, p=0.477; draw spans the full [0, 10000] lattice) + edge convergence on 10 target bands × 1M bets; serial lag-1 z=2.643, runs z=-2.034 (both inside the Bonferroni α/3 screen); all 10 bands within 5·SE of 0.999; statistics re-derived in verify from the stored census; mean simulated RTP 99.761% |
| 17 | Simulation Pass 2 cherry-pick | PASS | 134 revealed epochs × 10,000 nonces; early window = nonces 0–49 (the captured range is 0–50: nonce 50 occurs only in the 4 capture-retry epochs, DL-1), reference = 50–9999; payout-weighted return of the served bands standardized by its exact per-bet mean/variance (a scaled Poisson-binomial across seeds), re-derived in verify from the revealed seeds; aggregate early-window z=1.120, tested with a pre-registered one-sided normal (CLT) lower-tail, p=0.869 → no cherry-picking; 71 epochs below expectation, 63 above |
| **Configuration Coverage** | | | |
| 18 | Configuration coverage (target space, stake levels, direction mode) | PASS | All 10 target bands of width 1000 above the 350-bet floor in `src/loader.ts`; 3,862 of 9,999 valid targets exercised; both declared stake levels above the 100-bet floor ($0.01: 6,500 · $10: 200); the declared direction-mode set {over} equals the observed `bet_type` set exactly; roll-under is offered by Duel, was not captured and is not covered by this audit (DL-14); theoretical RTP measured flat at 0.999 across the full target range in the 0.1% edge tier, so unexercised targets in that tier carry no unverified return |
| **RNG Bias & Multiplier Curve** | | | |
| 19 | Draw bias bound (sampling uniformity) | PASS | Rejection sampling over a 2³² uint32 domain; `MAX_FAIR = 10001 × 429453 = 4294959453` is an exact whole number of ranges → worst-case modulo bias 0, inside the 2⁻³² ceiling; 7,843 chunk values in the discarded tail |
| 20 | Multiplier monotonicity & bounds | PASS | 3,862 distinct win-chance points; multiplier (recomputed from the target, not the operator field) strictly decreasing in win chance — 0 inversions, 0 targets mapping to >1 multiplier; 6,700/6,700 quoted multipliers within the declared odds band [0.9992, 9990.999] derived from the target band 1..9999 in `src/loader.ts` |
| **Live-Sample Fit** | | | |
| 21 | Live-Sample Fit (informational) | PASS | 6,700 rolls KS p=0.156, lag-1 z=1.87, runs p=0.033 — informational, distribution proven exactly by Step 5 |

Step 21 is informational and verdict-light: a distributional cross-check of the 6,700 captured rolls that reports a deviation as INFO, never a FLAG or a hard fail.

**Boundaries.** The strict win rule is witnessed by data: one tie (`result == target`) settled as a loss and one just-above-tie (`result == target+1`) settled as a win (DL-10). The roll ceiling 10,000 and floor 0 are witnessed by the 2,000,000-draw census, whose observed span is exactly [0, 10000]; the floor is also reached by two captured bets (50127125 and 50151385, both losses), the ceiling by none (maximum captured roll 9,998); `result = 0` loses at every positive target and `result = 10000` wins at every target in the observed range. Nonce 0 (message `clientSeed:0`) is verified for the 134 epoch-first bets and nonce 49 across all epochs (Steps 4, 5).

**Informational context (not scored — underpowered at live sample sizes).**

| Item | Detail |
|------|--------|
| RTP analysis | Empirical 83.9856% (high-variance game; theoretical 99.9000% in the 0.1% edge tier, proven in Step 13) |
| Win rate chi-squared | 2 target groups with ≥10 bets (9,800: 25/1,000, p=0.2585; 9,700: 20/700, p=0.8250); 0/2 fail at α=0.01; min p=0.2585; 0/2 at Bonferroni α/2=0.005 |
| Win rate, fixed-target phases | Phase B (t=9800): 25/1,000 wins, theoretical 1.9998%, p=0.2585; Phase C (t=9700): 5/200, 2.9997%, p=0.6787; Phase D (t=9700): 15/500, 2.9997%, p=0.9997 |
| Serial independence (lag-1, raw result series) | r₁=0.022881, z=1.873 (\|z\|<3); no serial correlation |
| Serial independence (runs test) | runs=3264, expected=3351.0, z=−2.126, p=0.0335 (≥ 0.01 threshold) |

The live chi-squared tests the two target groups with enough bets (target 9,800, Phase B, 1,000 bets; target 9,700, Phases C and D together, 700 bets) against the theoretical win chance. It is informational and underpowered by construction; the definitive uniformity test is the 2,000,000-draw census in Pass 1 (Step 16), and the distribution itself is proven exactly by the per-bet recomputation in Step 5.

**Step 17 (cherry-pick).** Pass 2 scored all 134 revealed epochs at 10,000 nonces each, treating nonces 0–49 as the early window and the remainder (50–9999) as the reference. The early window is the 50-bet captured depth per epoch, not the captured nonce range: that is 0–50, nonce 50 occurring only in the 4 capture-retry epochs (DL-1), and nonce 50 lies in the reference window. The statistic is the payout-weighted return of the bands the casino actually served in each epoch, standardized by the exact per-bet mean and variance of that return (a scaled Poisson-binomial across seeds); every window is re-derived in verify from the revealed seeds. The aggregate early-window return z=1.120, tested with a pre-registered one-sided normal (CLT) lower-tail, p=0.869: no cherry-picking. The direction split is 71 epochs below expectation and 63 above, consistent with noise. Detection power: 16.3 percentage-points of per-bet return deficit at 80% power.

### False-alarm rates

Each rule below can move a step on its own measurement, and each is listed with the probability that it fires when the game is fair: every roll exactly uniform on the 0..10000 lattice (Step 19) and independent of every other roll. The cap is 5% for a rule that moves a step to FLAG and 1% for a rule that moves it to FAIL. Every statistical rule in this package moves a step to FAIL; none moves one to FLAG. Each rate is computed for the rule as the step applies it and is printed in that step's detail and in its `data.falseAlarm` record in `outputs/verification-results.json`.

| Rule | Moves step to | Threshold | False-alarm rate | Method |
|---|---|---|---|---|
| Step 6: rolls unchanged under a wrong client seed | FAIL | 3 or more of 670 (bound E + 5σ + 1 = 2.36) | 4.7e-5 | exact binomial tail, Binomial(670, 1/10001) |
| Step 6: rolls unchanged under an empty client seed | FAIL | 6 or more of 6,700 (bound 5.76) | 7.1e-5 | exact binomial tail, Binomial(6,700, 1/10001) |
| Step 16: draw uniformity, chi-squared on 100 bins (df 99) | FAIL | p below 0.00167 or above 0.99833 (two-sided at α/3 = 0.00333) | 0.0039 | non-central chi-squared, λ = 1.98: bin 0 holds 101 of the 10,001 lattice values and every other bin 100, while the screen takes all 100 expected counts as equal |
| Step 16: lag-1 autocorrelation of the 2,000,000 draws | FAIL | \|z\| ≥ 2.935 | 0.0033 | standard normal |
| Step 16: Wald–Wolfowitz runs about 5000 | FAIL | p < 0.00333 | 0.0033 | standard normal |
| Step 16: lag-1 or runs | FAIL | either of the two rows above | 0.0059 | bivariate normal: the two statistics read the same draws and correlate at −0.75 (derived from the lattice), so their rates do not add |
| Step 16: edge bands | FAIL | any of the 10 bands beyond 5·SE + 1e-4 of 0.999 at 1,000,000 bets | 3.2e-6 | exact binomial tail per band |
| Step 17: aggregate early-window return | FAIL | one-sided normal lower-tail p < 0.01 | 0.0036 (standard error 0.0000078) | calibrated simulation, 1,000,000 replicates, seed 20261006 (`npm run false-alarm:pass2`): exact over the 1,700 slots served at targets 9,700 and 9,800, simulated over the other 5,000 |

A fair game fails Step 6 with probability at most 1.2e-4, Step 16 at most 0.0098 (uniformity + lag-1 or runs + edge bands) and Step 17 with probability 0.0036. Every rule is within its cap, so no rule was changed. Two rates differ from the rule's nominal level. The uniformity screen fires more often than its nominal 0.0033 because of the uneven bin. Step 17 fires less often than its nominal 0.01 because the served return is right-skewed: 1,000 of its 6,700 slots pay 49.95× with probability 0.02, so its lower tail is lighter than the normal tail it is tested against. Step 21 (live-sample fit) reports a deviation as INFO, which moves no step and no verdict, so no cap applies to it.

### Adversarial matrix

S5: fairness-integrity matrix; game-integrity testing not commissioned.

The standardized ProvablyFair.org fairness-integrity matrix (framework layer **S5**) applied to the Dice surface. Each row is an attack, the expected fair behaviour and the observed result, tied to the scored step or capture evidence that decides it on the delivered 6,700-bet capture. This audit covers the roll-over mode only (win iff `result > target`; roll-under not captured, DL-14), and Duel Dice draws with **HMAC-SHA256 plus rejection sampling**.

No attack in the tested paths succeeded: swapping a server seed breaks its commitment, the client seed changes the roll, the outcome is derived without the wager as an input, no statistical sign of operator seed pre-selection shows up in the capture, a bet cannot be credited against a multiplier other than the published formula's, the nonce sequence is complete and un-replayed, and the range mapping rejects the unfair tail so its residual bias is exactly zero. That is "no exploit found in the paths tested", not "no exploit exists": the tests cover what a client-side capture of this build can reach. Read the S5-4 row before quoting it: it passes on a structural mitigation whose Phase A–C auditor client-seed generator is `Math.random()`, not a CSPRNG (DICE-06 partial, DL-2), plus a limited-power statistical check, and does not rule out cherry-picking across the capture as a whole. S5-7 carries four disclosed capture-retry nonce gaps, each a verdict-neutral capture-origin FLAG (DL-1), not an operator-side anomaly.

**S5-5 and the instant-settle archetype.** Duel Dice places and settles a bet in a single action; there is no open multi-step round. The mid-round seed-rotation-reveal race (a TOCTOU class tested on multi-step games such as Mines and Limbo) is therefore not applicable to that named class here: no roll is ever pending against a not-yet-revealed seed. It is listed and excluded on archetype grounds, not claimed as a pass. This concerns that specific class only, not server-side settlement atomicity in general, which a client-side capture cannot test.

<!-- S5-MATRIX:START -->

| Test ID | Category | What Was Tested | Expected Behaviour | Result | Finding Summary |
|---------|----------|-----------------|--------------------|--------|-----------------|
| S5-1 | Seed substitution | Can a revealed server seed be swapped for a more favourable one while still matching the published commitment? | A substituted seed fails `SHA-256(hex_decode(serverSeed)) == server_seed_hashed`, and any accepted seed change alters the recomputed roll, breaking parity. | Pass | 134 of the 137 rotation transitions hash a revealed seed to the previous epoch's commitment (3 phase-boundary transitions excluded, 0 unrevealed, 0 mismatches); no alternative seed can satisfy a pinned SHA-256 commitment, and the forward next-seed chain is intact across all 137 links with the pre-capture link present, so the records chain in one epoch ORDER, not just one membership. These are consistency checks; that each commitment was shown before its bets rests on the capture's pre-bet observations (DL-4). [Step 1, Step 2] |
| S5-2 | Client-seed manipulation | Does the client seed genuinely enter the derivation, or is it decorative (letting the server ignore it)? | Recomputing a bet under a different client seed must change the roll, except for chance collisions on the 0..10000 lattice. | Pass | Client-seed sensitivity control: substituting a wrong client seed changes the roll for 670/670 sampled bets (0 collisions, lattice bound 2.36; empty-seed control over all 6,700 bets: 1 collision, bound 5.76) (the client seed feeds the HMAC message `clientSeed:nonce` keyed by the server seed); Phase D (500 bets, 10 distinct player-set client seeds) recomputes 500/500 exactly. [Step 6, Step 15] |
| S5-3 | Stake-conditional outcome | Does the game produce different (worse) rolls at higher stakes? | Bet amount must affect only `amount_won = amount × multiplier`, never the roll. | Pass | Phase C (200 bets at $10, 1,000× the $0.01 base stake) recomputes its roll identically to the base-stake phases (0 mismatch), and the outcome engine's signature takes no wager argument (`computeResult` arity 3), so a stake-dependent roll is impossible by construction. In the duel.com dice config as fetched 2026-10-05 in a logged-in session, read-only GET (E14; [Scaling edge](#scaling-edge)), stake selects the edge tier, which would move the multiplier, not the roll; which tier Duel's server applies above the 0.1% tier is not verified (DL-15), and the capture's stakes are all in the 0.1% tier. [Step 7] |
| S5-4 | Server-seed cherry-picking | Can the operator pre-select an unfavourable server seed before committing? | Player must be able to set a client seed the operator cannot foresee, removing the foreknowledge channel; a gross early-window skew must not exceed chance. | Pass, structural + limited-power statistical | Primary defence is structural: the roll depends on the player-set client seed, editable and rotatable *after* the server-seed commitment is published, so an operator that cannot foresee the client seed cannot pre-evaluate candidate commitments. Two disclosed caveats: (a) the Phase A–C client-seed generator is `Math.random()`, which is NOT a CSPRNG (DICE-06 partial, DL-2), and the Phase D `pfaudit`+timestamp seeds are predictable (DL-3, all 10 exposed epochs enumerated); (b) the secondary gross-bias check — Pass 2 — is limited-power. Pass 2 over all 134 revealed epochs at 10,000 nonces each standardizes the payout-weighted return of the served bands in the captured early window (nonces 0–49) by the exact per-bet mean and variance of that return (a scaled Poisson-binomial across seeds), re-derived from the revealed seeds: aggregate early-window z=1.120, tested with a pre-registered one-sided normal (CLT) lower-tail, p=0.869 → no cherry-picking (71 epochs below expectation, 63 above; detection power 16.3 pp of per-bet return deficit at 80% power). At the captured early-window size this has limited power; the client-seed mitigation is load-bearing, not the statistic. Nothing here rules out cherry-picking across the capture as a whole. [Step 17; DICE-06] |
| S5-5 | Seed-rotation race (TOCTOU) | Can a rotation issued concurrently with an in-flight bet change which server seed the bet settles against? | Rotation must not affect a bet already in flight; the settling seed is the one committed when the bet was accepted. | Not tested — disclosed | **Not applicable to this archetype.** Duel Dice settles a bet in a single action, so no roll is ever pending against a not-yet-revealed seed and there is no mid-round window to race. Structurally bounded by the commitment (each bet's `server_seed_hashed` is fixed at accept time and 6,700/6,700 rolls recompute against the seed committed for their epoch), but this single-session sequential capture drives one bet at a time and cannot exercise a concurrent rotate/bet interleaving; a dedicated concurrency capture is the only positive test. Server-side settlement atomicity in general is not testable from a client-side capture. |
| S5-6 | Multiplier tampering | Can a bet be credited against a multiplier that is not the one the published payout formula dictates — a per-bet substitution, or a credit that ignores the formula? | The multiplier is `(1 − edge) / winChance`, `winChance = (10000 − target) / 10001`, with the edge from the `scaling_edge` table in the duel.com dice config as fetched 2026-10-05 in a logged-in session (read-only GET; E14, [Scaling edge](#scaling-edge)); E14 holds no multiplier, so the `(1 − edge)` form above the 0.1% tier is this audit's reading of it; in the 0.1% tier that is `0.999 / winChance`. Every winning credit must equal that formula and the derivation must never read the operator's served `multiplier` field. | Pass | Step 9 recomputes the multiplier as `0.999 / ((10000 − target) / 10001)` from `request.target` alone for all 6,700 bets and asserts it equals the served `multiplier` field by integer equality on the 1e-18 grid (0 mismatches); the served field is compared, never read into the derivation, and `amount_won = amount × multiplier` is confirmed exactly on the 1e-18 grid (no tolerance) for every win with losses settling to 0 (Step 7). The capture exercises only the 0.1% tier, where the served multiplier equals the formula on all 6,700 bets; no scaled-tier multiplier is tested (DL-15). [Step 7, Step 9] |
| S5-7 | Nonce manipulation | Can the operator skip, reuse or reorder nonces — replaying a favourable draw, or dropping the ones it does not like? | Within an epoch the nonces must run contiguously from 0 with no gap, no repeat and no reorder (the block 0..49 here, where the capture rotated after every 50 logged bets), against a population the package declares rather than one the dataset asserts about itself. | Pass | 130/134 epochs are, as captured, the contiguous block 0..49 that the capture's 50-bet rotation schedule and `src/loader.ts` declare; in the other 4 the capture missed one nonce of 0..49 and recorded nonce 50, and the block is complete once that nonce is reconstructed (below). All 134 epochs are under a single client seed with first nonce 0. The population is bound to constants in `src/loader.ts` (G-BIND), **not** to the dataset's own header — a dataset that shrank its own declared epoch would otherwise pass by agreeing with itself. An operator-side gap, repeat or reorder is a HARD FAIL; the 4 nonce gaps in this capture (nonce 50 present, exactly one of 0..49 missing) are auditor-side capture retries reconstructed from a revealed server seed whose SHA-256 matches the commitment — disclosed as capture-origin FLAGs (DL-1), verdict-neutral, 0 unverifiable, never passed over. [Step 4] |
| S5-8 | Range-mapping bias | Does mapping the digest into the roll range skew one value? A naive `chunk % range` is biased whenever `range` does not divide 2^32. | Either the mapping rejects the unfair tail (rejection sampling) or it uses no modulo reduction at all; the resulting roll distribution must be indistinguishable from uniform on the outcome lattice. | Pass (rejection sampling — bias exactly 0) | Duel Dice scans 32-bit chunks of the HMAC digest and accepts the first `value < MAX_FAIR`, returning `value % 10001`. Step 19 recomputes the bound from the same `RANGE`/`MAX_U32`/`MAX_FAIR` constants the draw reads and proves `MAX_FAIR = 10001 × 429453 = 4294959453` is an EXACT whole number of ranges, so each of the 10,001 residues receives exactly 429453 accepted values and the worst-case modulo bias is **0** — well inside the profile's 2^-32 ceiling. Rejection census: 7,843 of the 2^32 chunk values fall in the discarded tail (per-chunk rejection ≈ 1.83×10⁻⁶). All 6,700 live rolls recompute against this mapping (Step 5). No open item — unlike a float-mapping draw, the per-value bias is enumerated to zero. [Step 5, Step 19] |

<!-- S5-MATRIX:END -->

Two supplementary rows follow the matrix:

| Test ID | Category | What Was Tested | Expected Behaviour | Result | Finding Summary |
|---------|----------|-----------------|--------------------|--------|-----------------|
| S5-S1 | Multi-account isolation | Could the operator supply the same server seed to multiple accounts to observe correlated outcomes? | Independent seed streams per account; no shared commitment across accounts. | Not tested — disclosed | Multi-account testing requires cooperation between multiple funded test accounts, which was outside the scope of this single-account audit. This is a structural limitation of the commit-reveal scheme; flagged as a future audit item (R-2). |
| S5-D1 | Effective-edge sign (player-favourable band hunt) | Is there any target whose effective edge is negative (a `+EV` bet)? | Every playable target must keep a strictly positive house edge. | Pass | In the 0.1% edge tier the effective edge is derived per target from the lattice and the multiplier formula: `RTP = winChance × multiplier = 0.999` **exactly at every integer roll-over target 1..9999** (max deviation 1.1×10⁻¹⁶, Step 13), so in that tier the roll-over edge is a flat 0.1% across the whole target range with no discretisation asymmetry and no ceiling effect. In E14 (the duel.com dice config as fetched 2026-10-05 in a logged-in session, read-only GET) all 10,712 tiers have an edge between 0.1% and 1.0%, so no tier in it is player-favourable; the scaled tiers are not verified (DL-15). **Player-favourable bets in the capture: 0**, and none is possible on the valid roll-over target band in the 0.1% tier. Roll-under is not covered (DL-14). [Step 13, Step 20] |

## Reproduce the audit

Use **Node.js 22.x**, pinned in `package.json` `engines` and `.nvmrc`. The committed artifacts in `outputs/` were produced on that line, and the last bits of a derived floating-point statistic are runtime-dependent (see the tolerance below). Run from the package directory:

```sh
npm ci
npm test
```

`npm test` runs the Mocha unit tests and the verification suite only. It scores the pinned artifacts and does **not** regenerate them: Steps 16–17 re-derive their statistics from the pinned census and the revealed seeds. Expected: **20 passing**, then **20/21 PASS + 1 capture-origin FLAG (Step 4)**, `PROVABLY FAIR — Full Pass`, `REPRODUCED`, exit 0. The release record measures `npm test` at 10 s wall time on an Apple M2 Max (12 cores) with Node 22.23.1, on 28 September 2026.

| Command | Purpose |
|---------|---------|
| `npx mocha` | Unit tests only (`tests/dice/DiceTests.ts`): seven live (serverSeed, clientSeed, nonce) → result vectors, commitment tamper-detection, the RTP / house-edge identity, and Duel's own Verify-tab code executed on the seven vectors and all 6,700 bets |
| `npm run verify` | The 21 scored steps and 5 informational items; writes this run's products and `diff.json` to `outputs/run/` |
| `node verify.js` | Dependency-free standalone bundle of the same verifier, built from the repo root via `audit-framework/tools/build-standalone-verifier.mjs`; runs the whole verdict with zero `npm install` |
| `npm run simulate:run` | Regenerate the simulation (the ~2,000,000-draw census, the 10 × 1,000,000-bet edge bands and the 134 × 10,000-nonce Pass 2) into `outputs/run/` |
| `npm run test:full` | Simulation regeneration into `outputs/run/` → mocha → verify, field-diffed against the pin |
| `npm run mutate` | The falsifiability battery, in a disposable copy; never writes inside the package |
| `node scripts/check-site-verifier.mjs <derive.js> \| --live` | Compare a ProvablyFair.org site checkout, or the live deploy, with the vendored verifier bytes |
| `npm run rtp-claim:write` | Rewrite `outputs/rtp-claim-table.json` and print its SHA-256 to pin |
| `npm run false-alarm:pass2` | Recompute Step 17's false-alarm rate on a fair game by the declared simulation and report whether it equals the figure in `src/false-alarm.ts` ([False-alarm rates](#false-alarm-rates)) |
| `node scripts/dice-config-tiers.mjs` | Print the [Scaling edge](#scaling-edge) figures from E14 (Duel's dice config) and where each captured bet falls in it; read-only, information only |
| `npm run release-manifest` | Write `RELEASE-MANIFEST.json` |

Verify the dataset identity independently:

```sh
shasum -a 256 data/dice-master-6700bets.json
```

Expected: `3550ffca07a6f7825f96cdd4e3d8c3cd57898b5b5238b9739753a754cff056d6`.

### The gate

`npm run verify` writes **nothing** into `outputs/`. This run's results, its determinism log, its chi-squared table and `diff.json` go to `outputs/run/` (gitignored, a run record rather than audit evidence), so a re-run cannot replace the evidence it scores, and a disagreement between two runs is recorded rather than resolved in favour of whichever ran last.

**The reproduction is checked, not left to the reader.** Every `npm run verify` diffs this run leaf by leaf against the committed `outputs/verification-results.json`, `outputs/determinism-log.json` and `outputs/chi-squared-results.json`, writes the comparison to `outputs/run/diff.json` and prints `Reproduction vs the committed artifacts on Node <version>: REPRODUCED`. The bar is agreement within the tolerance declared in `src/diff.ts`, `|a − b| ≤ 1e-14 + 1e-12·max(|a|,|b|)` (**1e-14 absolute + 1e-12 relative**), with two distinct integers never agreeing, rather than byte identity. Byte identity is applied where it belongs: the dataset, hash-pinned in `src/loader.ts`, and the four artifacts of record (`simulation-results.json`, `rtp-convergence.html`, `determinism-log.json`, `chi-squared-results.json`), hash-pinned in `src/artifact-pins.ts` and checked by Step 12. No artifact of record carries run metadata: the `generatedAt` field was removed from `tests/verify.ts`, the generator, on 2026-09-24 and the two verifier artifacts were re-emitted with `PF_EMIT=1` with every value unchanged, so the diff excludes no field. A difference inside the bound is recorded as `withinTolerance` and not scored; a difference outside it is a different result, is named on stdout, and exits 1. So that the comparison can be numeric, each scored step carries its measurements as numbers in `steps[].data` and states the *bound* in its prose `detail`. The SHA-256 dataset guard is never rewritten to make a run agree with it.

Exit codes are the verdict, so nothing automated can read a Conditional Pass as clean:

| Code | Meaning |
|------|---------|
| `0` | `PROVABLY FAIR — Full Pass`, and this run reproduces the committed artifacts |
| `1` | at least one hard fail, **or** a reproduction difference beyond tolerance |
| `2` | at least one operator-origin FLAG — `PROVABLY FAIR — Conditional Pass`. A capture-origin FLAG (Step 4) is disclosed as a limitation and does not move the verdict off Full Pass or the exit off 0 |
| `5` | `RTP FIGURE OVERSTATED`: no draw check failed, but the RTP-CLAIM rule (1.2.0, switched on) found settings beyond the 0.1 pp band on the house side of the published figure. It outranks a Conditional Pass; a hard fail (exit 1) outranks it |

### Deliberate artifact refresh

A run only rewrites the committed artifacts under `PF_EMIT=1`:

```sh
PF_EMIT=1 npm run verify   # verification-results.json, determinism-log.json, chi-squared-results.json
npm run simulate           # runs with PF_EMIT=1: rewrites simulation-results.json and rtp-convergence.html; re-pin src/artifact-pins.ts
```

To refresh the RTP claim table after a reviewed change:

```sh
npm run rtp-claim:write
# update RTP_CLAIM_TABLE_SHA256 in src/rtp-settings.ts with the printed digest
npm run verify
npm run release-manifest
node scripts/release-manifest.mjs --check
```

The release generator requires both README.md and MANIFEST.md and checks that each carries the audit ID. After a change to the TypeScript sources, rebuild `verify.js` with the standalone builder so the bundle and the sources do not drift apart.

### Package layout

| Path | Contents |
|------|----------|
| `src/rng.ts` | HMAC-SHA256 dice algorithm |
| `src/operator-verifier.ts` | Duel's own Verify-tab code (E13): pinned, executed by Step 5 |
| `src/site-verifier.ts`, `src/live-site-verifier.ts` | ProvablyFair.org docs-site `derive.js` and the live verify-bets bundle: pinned, executed by Step 5 |
| `src/loader.ts` | Dataset loader, hash check and population constants |
| `scripts/dice-config-tiers.mjs` | Reads E14 (Duel's dice config) and the dataset, both hash-checked; prints the Scaling edge figures. No scored step uses it |
| `src/stats.ts`, `src/simulate.ts` | Chi-squared, autocorrelation, runs test; two-pass simulation |
| `src/false-alarm.ts`, `src/false-alarm-pass2.ts` | False-alarm rate on a fair game of every statistical rule that can move a step; the simulation behind Step 17's rate |
| `verifier-parity/` | Byte-exact copies of the player verifiers Step 5 executes |
| `capture/` | The capture script behind the dataset and its reference record; the next-capture script (not run), its offline unit test and its plan (see [Dataset and capture](#dataset-and-capture)). No scored step uses them |
| `tests/verify.ts` | 21-step verification orchestrator + 5 informational items |
| `tests/dice/DiceTests.ts`, `tests/steps/` | Unit tests; domain modules (commitment, determinism, etc.) |
| `outputs/` | Committed artifacts of record; `outputs/run/` holds a run's products and is gitignored |

### Falsifiability battery

`npm run mutate` applies each declared mutation in `tests/mutations.json` in a disposable copy and requires it to make one NAMED step reject it. The release record reports **49/49 mutations killed and 21/21 scored steps covered**, 0 declared survivors (`npm run mutate` on the evening of 14 October 2026, Apple M2 Max, 12 cores, Node v22.23.1, the whole registry of 49 entries in one run; [RELEASE-MANIFEST.json](RELEASE-MANIFEST.json)). The two whole-registry runs before it, on 6 October 2026 and on 14 October 2026 on the tree carrying RTP-CLAIM 1.2.0 switched on (same machine and Node), predate the four exit-5 entries and each killed 45/45, 21/21 scored steps covered. The runner reads the scored-step set from the baseline run rather than assuming it. The registry includes a re-pin-class forgery (M12b doctors the dataset AND disables the pre-flight abort, so Step 12's own hash comparison must catch it), the anti-circularity guards of Step 13 (M13b neuters the injected-corruption negative control; M13c mis-wires the lattice-enumeration anchor), the Phase C bet-size-invariance coverage guard of Step 7 (M07b), the Step 5 recomputation-coverage guard (M05b drops a revealed seed so a bet cannot be recomputed), the Step 8 outcome-range guard (M08b) and boundary/ceiling witness (M08c), the Step 18 stake-level (M18b) and direction-mode (M18c) coverage guards, the simulation re-derivation guards (M16 forges the uniformity chi-squared; M17 forges one epoch's served-band return) and the informational live-fit step (M21). Added 2026-09-24: the Step 6 empty-seed control (M06b), single-unit forgeries on the exact 1e-18 grid of a win credit (M07c) and a multiplier (M09b), both of which the former tolerances (relative 1e-12, absolute 1e-6) let through, the Step 7 stake-price comparison (M07d), and a byte change to a pinned artifact with every value intact that only the Step 12 SHA-256 pin can see (M12d). Added 2026-09-25 for Duel's own Verify-tab code (DICE-09): M05c forges it and re-pins it, M05d edits it without re-pinning, M05e breaks a `src/rng.ts` citation. Added 2026-09-25 for the ProvablyFair.org player verifiers (DICE-24): M05f forges the docs-site `derive.js` roll and re-pins it, M05g edits it without re-pinning, M05h edits a live-site chunk without re-pinning, M05i forges the live Duel Dice roll and re-pins the chunk, M05j makes the live page print a seed hash other than the commitment and re-pins it. Second pass, 14–15 October 2026 (FIXPASS2 class C3, the exit-5 entries): see the release-history entry "14 October 2026 (second pass)"; the release manifest records that run.

## Verify a bet

An ordered path a player can follow to check a single roll-over bet end to end, in the field names Duel.com serves. It is for roll-over bets only: a roll-under bet does not verify with `result > target`, and this audit does not cover that mode (DL-14). It reproduces the roll, the win decision and the credit from nothing but the revealed seed, the client seed and the nonce, plus, for the credit, the bet's edge tier.

1. **Save the commitment, then reveal the server seed.** Before you bet, copy the active server seed (hashed), `server_seed_hashed`, from the Dice fairness panel and save it with the time you saw it. After your bets, **rotate your seed pair** in the same panel (set a new server seed). Rotation ends the current epoch and reveals its plaintext `serverSeed`. Until you rotate, only the commitment is public. Your saved copy, made before the bet, is what lets you check later that the seed was fixed in advance. (The panel appears in the illustrative screenshot E04.)

2. **Collect the fields to paste.** From your bet record / the fairness panel:
   - `serverSeed` — the revealed plaintext hex string (from step 1)
   - `server_seed_hashed` — the commitment you saved before the bet (step 1); the bet record carries the same field, which should equal it
   - `client_seed` — your client seed for that epoch
   - `nonce` — the bet's index within the epoch, counting from 0 (0..49 in this capture, and 0..50 in the 4 capture-retry epochs, DL-1)
   - `target` — your chosen target (1..9999)
   - `amount` — your stake; `result`, `is_win`, `multiplier`, `win_chance`, `amount_won` — the served outcome you are checking

3. **Check the revealed seed against your saved commitment.** The seed is hashed as **bytes**, not as its hex string:

   ```
   SHA-256( hex_decode(serverSeed) )  ==  server_seed_hashed   // the value you saved before betting
   ```

   A PASS means the two hashes are equal: the revealed seed is consistent with the commitment. The hash match does not show when the commitment was shown; that assurance comes from your saved record from before the bet.

4. **Recompute the roll** with `verifyDiceBet(serverSeed, client_seed, nonce, result)` below. It keys HMAC-SHA256 with `hex_decode(serverSeed)`, messages `` `${client_seed}:${nonce}` ``, then scans 8-hex-char (32-bit) chunks left to right and returns `chunk % 10001` for the **first** chunk below `MAX_FAIR = 0xFFFFFFFF − (0xFFFFFFFF % 10001)` (rejection sampling: the tail is discarded so the roll is unbiased). The returned `result` must equal the served `result`.

5. **Apply the win rule (strict inequality).** The bet is a win iff:

   ```
   is_win  ==  ( result > target )
   ```

   A `result` exactly equal to `target` is a **loss**; the inequality is strict. This is the roll-over rule; it does not apply to a roll-under bet.

6. **Recompute the multiplier and the payout.**

   ```
   win_chance  =  (10000 − target) / 10001
   edge        =  house_edge of your bet's tier in Duel's dice config
                  (range: key ≤ 10000 − target ≤ range_to; tier: the min_bet..max_bet holding amount)
   multiplier  =  (1 − edge) / win_chance     // 0.999 / win_chance at the 0.1% tier
   amount_won  =  is_win ?  amount × multiplier  :  0
   ```

   The `0.999` form is the special case edge = 0.1%, the tier of every captured bet. Duel's bet response showed `effective_edge` 0.1 on all 6,700 of them at bet time. The `effective_edge` on a settled record can differ from the bet-time value, and this audit has not established that the bet-time value equals the tier edge on a scaled bet, so step 6 takes the edge from Duel's dice config as served when you bet (`GET /api/v2/dice/config`; E14 is the copy as fetched 2026-10-05 in a logged-in session, read-only GET, and [Scaling edge](#scaling-edge) gives this audit's reading of its ranges). Above the 0.1% tier the formula is not verified (DL-15). The served `win_chance` matches to 14 decimals, `multiplier` to the served precision, and `amount_won` equals `amount × multiplier` for a win (0 for a loss). Apart from the tier edge, none of these reads an operator field; every other figure is derived from `target` and the recomputed `result`.

If all six checks hold, the bet is provably fair: its outcome follows from a server seed consistent with the commitment you saved before betting (your saved record, not the hash match, is what shows the commitment came first), it is driven by your own client seed, and it is paid by the published formula. The audit runs this path over all 6,700 captured bets ([Verification results](#verification-results)).

```javascript
const crypto = require('crypto');

function verifyDiceBet(serverSeed, clientSeed, nonce, claimedResult) {
  const RANGE    = 10001;
  const MAX_U32  = 0xFFFFFFFF;
  const MAX_FAIR = MAX_U32 - (MAX_U32 % RANGE);

  const key     = Buffer.from(serverSeed, 'hex');  // hex → bytes
  const message = `${clientSeed}:${nonce}`;
  const hash    = crypto.createHmac('sha256', key).update(message).digest('hex');

  for (let off = 0; off + 8 <= hash.length; off += 8) {
    const chunk = parseInt(hash.slice(off, off + 8), 16);
    if (chunk < MAX_FAIR) {
      const result = chunk % RANGE;
      return { result, match: result === claimedResult };
    }
  }
  throw new Error('hash exhausted');
}
```

**Or paste it into a verifier page.** The [ProvablyFair.org verifier](https://www.provablyfair.org/verify-bets) (Casino = Duel.com, Game = Dice) returns the roll and the server-seed hash; compare that hash with the commitment you saved before betting. It does not compute the win flag or the multiplier, so checks 5–6 stay yours. Its parity with the captured bets is described under [Player verifiers](#player-verifiers).

## Evidence

All evidence files are in [evidence/](evidence/). Screenshots illustrate interface states; they do not replace the recorded responses.

| ID | File | Description |
|----|------|-------------|
| E01 | [evidence/E01-dice-game-ui.png](evidence/E01-dice-game-ui.png) | Dice game interface showing target selector and result display |
| E02 | [evidence/E02-fairness-page-overview.png](evidence/E02-fairness-page-overview.png) | Duel.com fairness page overview |
| E03 | [evidence/E03-fairness-verify-dice.png](evidence/E03-fairness-verify-dice.png) | Dice verification tab on fairness page (its Code panel is collapsed here; the code itself is E13) |
| E04 | [evidence/E04-active-commitment.png](evidence/E04-active-commitment.png) | Illustrative UI state: the Provably Fair seed modal, showing the active client seed, the active server seed (hashed), the nonce, a new client seed and the next server seed (hashed) |
| E05 | — | Withdrawn: it showed the same seed modal as E04 |
| E06 | [evidence/E06-phase-b-start.png](evidence/E06-phase-b-start.png) | Illustrative UI state: the Dice game at roll over 98.00 (multiplier 49.9550, win chance 2.00%) |
| E07 | [evidence/E07-phase-c-start.png](evidence/E07-phase-c-start.png) | Illustrative UI state: the Dice game at roll over 99.00 (multiplier 99.9100, win chance 1.00%), bet amount $0.00 |
| E08 | [evidence/E08-phase-d-start.png](evidence/E08-phase-d-start.png) | Illustrative UI state: the Dice game with a $10.00 bet amount at roll over 97.00 (multiplier 33.3033, win chance 3.00%) |
| E09 | [evidence/E09-seed-rotation.png](evidence/E09-seed-rotation.png) | The Verify tab of the fairness page: the Dice calculation form (client seed, server seed, nonce), its game result and the start of the Code panel |
| E10 | [evidence/E10-bet-history.png](evidence/E10-bet-history.png) | An example roll-under bet: the bet modal of a Dice bet at "Roll Under 49.95" that rolled 53.50 and paid $0.00 (DL-14) |
| E11 | [evidence/E11-client-seed-rotation-response.png](evidence/E11-client-seed-rotation-response.png) | Seed rotation API response (`POST /api/v2/client-seed/rotate`) — `client_seed` is the browser-generated value submitted by the player; server does not assign it. Confirms Full Pass client seed origin. |
| E12 | [evidence/client-seed-origin.png](evidence/client-seed-origin.png) | Duel.com's default client-seed generator, excerpted from the live JS bundle (`assets/index-DlvddfIT.js`, captured 2026-06-03): each character is drawn from a 63-char alphabet via a rejection-sampled `crypto.getRandomValues` (browser CSPRNG), and `FairnessNextSeed.vue` pre-fills the "New client seed" field client-side — the server only receives the value on `POST /api/v2/client-seed/rotate`. Complements E11: the operator's default seed path is CSPRNG; the auditor's own Phase A–C capture seeds are the separate `Math.random()` disclosure in DL-2. |
| E13 | [evidence/verify-tab/duel-verify-tab-dice-2026-09-25.js](evidence/verify-tab/duel-verify-tab-dice-2026-09-25.js) | Duel's own Dice verification code: the Code panel of duel.com → Provably Fair → Verify (Dice) → Expand → Copy, copied verbatim by the auditor on 2026-09-25 and never edited. SHA-256 `38b257c67d7a342754a201a4cf5220198807c9c1fffe0739b47f099e65950a5b`, 2,678 bytes, 84 lines. Pinned with its runner ([verifier-parity/operator/run-operator-verifier.cjs](verifier-parity/operator/run-operator-verifier.cjs)) in `src/operator-verifier.ts`, executed unmodified by Step 5 and the unit tests on all 6,700 bets (0 disagree), and cited line by line in `src/rng.ts` (DICE-09). |
| E14 | [evidence/E14-dice-scaling-config-2026-10-05.json](evidence/E14-dice-scaling-config-2026-10-05.json) | The duel.com dice config: the response body of `GET /api/v2/dice/config` (HTTP 200), as fetched 2026-10-05 in a logged-in session (read-only GET), `fetched_utc` 2026-10-05T12:16:16.889Z, saved byte for byte. SHA-256 `745be0686f27f94eb74930a71847d97b087780ba27eecbb60bf989257c025c1d`, 1,320,325 bytes. Beside it, [evidence/E14-dice-scaling-config-2026-10-05.json.meta.json](evidence/E14-dice-scaling-config-2026-10-05.json.meta.json) records the path, status, response headers and `fetched_utc` of that request (SHA-256 `a3caec9eed1453a4b9aa6a1ccf0b26034cf7ef0ea3cf58a1b868a730bebe20fe`, 4,805 bytes). Source of every [Scaling edge](#scaling-edge) figure, read by `node scripts/dice-config-tiers.mjs`, which checks this SHA-256 first. No scored step reads it. |

E04 and E06–E10 are illustrative interface states. No phase or dataset claim is made for them: the seeds in E04 and E09 and the bet ID in E10 do not appear in the dataset. The file names are kept from v1.0.0; the descriptions above say what each image shows.

E04 and E10 (2026-10-01): other players' usernames are masked with solid boxes: the Player column of the live-bets table behind the panel in both, and in E10 also the username and avatar of the bet's owner in the bet modal. Every pixel outside the boxes is unchanged (compared pixel by pixel). No step reads or hashes an image.

| ID | SHA-256 as captured | SHA-256 masked |
|----|---------------------|----------------|
| E04 | `9160328e0869983404d7131e4c8e9eb43bfabaa215e7f3e3839e956fa0db6e17` | `65c498344211ff3747ae432cd95ee9e7eedc8889feb3004694cecc74d1a745c5` |
| E10 | `4c1d9248d35e5c92453f90f790db400d9fbba4af248f222d85a6f8009031af80` | `d80b2726b243052dffef665bca24d0ecf321700aeb7808e43afc33225c601054` |

### Files supporting the recorded result

| File | Role | Generated by |
|------|------|--------------|
| [data/dice-master-6700bets.json](data/dice-master-6700bets.json) | Primary dataset — 6,700 bets, 138 seed entries, all phases A–D; SHA-256 `3550ffca07a6f7825f96cdd4e3d8c3cd57898b5b5238b9739753a754cff056d6` | capture, except the plaintext on `seeds[0]`, copied from `seeds[1]` outside the capture script ([Dataset and capture](#dataset-and-capture)) |
| `verifier-parity/games/dice/derive.js`, `verifier-parity/lib/hmac-sha256.js` | Byte-exact copy of the ProvablyFair.org docs-site Dice verifier (VerifyBets, mikepforg/pf-audit-duel `origin/main` @ bd4d59c, read with `git cat-file` 2026-09-25), pinned by SHA-256 in `src/site-verifier.ts` and executed by Step 5 on every captured bet (DICE-24) | `node scripts/check-site-verifier.mjs <site derive.js>` |
| `verifier-parity/live-site/chunks/*.js`, `verifier-parity/live-site/run-live-verifier.cjs` | Byte-exact copy of the three live www.provablyfair.org/verify-bets chunks the Duel Dice derivation needs (GET 2026-09-25), and the runner that executes them; pinned in `src/live-site-verifier.ts` and executed by Step 5 on every captured bet (DICE-24) | `node scripts/check-site-verifier.mjs --live` |
| [outputs/verification-results.json](outputs/verification-results.json) | All 21 scored step results (20 PASS + 1 capture-origin FLAG, verdict-neutral) + 5 informational items | `PF_EMIT=1 npm run verify` |
| [outputs/determinism-log.json](outputs/determinism-log.json) | RNG recomputation summary (6,700 verified, 0 mismatches) — pinned | `PF_EMIT=1 npm run verify` |
| [outputs/chi-squared-results.json](outputs/chi-squared-results.json) | Per-target win rate chi-squared statistics (2 groups with ≥10 bets: targets 9,800 and 9,700) — pinned | `PF_EMIT=1 npm run verify` |
| [outputs/simulation-results.json](outputs/simulation-results.json) | Two-pass simulation results (Pass 1: 2M-draw uniformity census + 10 target bands × 1M bets; Pass 2: 134 revealed epochs × 10,000 nonces) — pinned | `npm run simulate` |
| [outputs/rtp-convergence.html](outputs/rtp-convergence.html) | Convergence chart over the 10 served bands — pinned | `npm run simulate` |
| [outputs/rtp-claim-table.json](outputs/rtp-claim-table.json) | Exact RTP of every target 2–9,998 in the 0.1% edge tier against the flat 99.9% claim; RTP-CLAIM 1.2.0, scored on Step 13, pinned in `src/rtp-settings.ts` | `npm run rtp-claim:write` |
| [RELEASE-MANIFEST.json](RELEASE-MANIFEST.json) | Release identity, artifact hashes, recorded score and mutation-run record | `npm run release-manifest` |

## Limitations and trust

The commit-reveal records support three findings. The first rests on consistency checks together with the capture's own pre-bet observations; the other two rest on recomputation:

1. **The server seed was fixed before the bets it covers.** Two kinds of evidence bear on this, and they establish different things:
   - *Consistency.* At all 134 compared rotation transitions the revealed seed's `SHA-256(hex_decode(serverSeed))` equals the commitment of the epoch it closed (Step 1), every rotation promoted the next-seed hash already recorded, and the 137 forward links hold (Step 2). Hash matching and forward links are consistency checks: they show the seed records fit together, not when a commitment was shown.
   - *Timing.* That each commitment was shown before its epoch's bets rests on the capture's recorded pre-bet observations: the capture recorded each epoch's active commitment at the rotation that opened it, and that record's capture timestamp precedes the epoch's first bet for 134/134 epochs with bets (measured for this release, not scored); the pre-capture link shows the first epoch's hash already outstanding as "next" at the first observation. This timing holds only to the extent the capture is a faithful record of what Duel served, which this package assumes (DL-4, DL-11).
2. **The RNG output is deterministic given the inputs.** 6,700/6,700 results reproduced exactly.
3. **The win condition and payouts are applied correctly.** Zero errors across all formula checks.

Two structural limitations remain in any commit-reveal system without an external randomness beacon such as drand.

**Seed selection (cherry-picking).** The operator generates server seeds before the player places bets. The commitment prevents changing the seed mid-epoch, but the operator could theoretically generate many server seeds, evaluate their outcomes across all nonces, and select seeds favorable to the house. Pass 2 (Step 17) tests this: aggregate early-window return z=1.120, one-sided p=0.869, no cherry-picking; direction split 71 below / 63 above; detection power 16.3 percentage-points of per-bet return deficit at 80% power. A genuinely cherry-picked early window would push the served-band return systematically below its exact expectation; the aggregate sits above it, so no exploitation signal is present. Duel.com Dice does not use drand (`drand_round: null` in all 6,700 bets); the cherry-pick risk is present but showed no statistical evidence of exploitation in this dataset.

**Multi-account seed sharing.** The operator could supply identical server seeds to multiple accounts, allowing observation of player bet patterns before committing. This is a structural property of all HMAC-based commit-reveal schemes without drand. Not tested (single account).

| Property | HMAC-only (Duel Dice) | HMAC + drand |
|----------|----------------------|--------------|
| RNG deterministic from seeds | Yes | Yes |
| Seed commitment pre-bet | Yes | Yes |
| Seed selection exploitable | Theoretically possible | Prevented |
| External dependency | None | drand availability |

| Claim | Verifiable? | Notes |
|-------|-------------|-------|
| Revealed seed is consistent with its commitment | Yes | `SHA-256(hex_decode(serverSeed)) === server_seed_hashed`, plus next-hash promotion and forward links; consistency checks, not timing |
| Commitment was shown before the bets | Conditionally | The capture's recorded pre-bet observation of each epoch's commitment (134/134 epochs with bets); holds only as far as the capture is faithful (DL-4, DL-11). A player gets this assurance by saving the commitment before betting |
| RNG output matches claimed result | Yes | Full recomputation from revealed seed |
| Win condition applied correctly | Yes | `result > target` verified for all 6,700 bets |
| Multiplier formula correct (0.1% tier) | Yes | `0.999 / win_chance` confirmed by integer equality on the served 1e-18 grid (Step 9); scaled tiers not verified (DL-15) |
| Win chance formula correct | Yes | `(10000−target)/10001` confirmed to 14 decimal places |
| Server did not choose seed knowing client actions | Structural | Standard commit-reveal limitation (above) |
| Client seed is genuinely player-controlled | UI trust | Platform generates default seeds; player can set custom |

### Load-bearing premises

Every premise the Full Pass rests on, the artifact that witnesses it, and whether the 6,700 captured bets could have contradicted it. A premise the data **cannot** contradict must carry a witness from outside this repository's own pipeline, or be marked ASSUMED; a check agreeing with the model that produced it is not evidence.

| Premise | Witness artifact | Could the captured data contradict it? |
|---------|------------------|----------------------------------------|
| Outcome rule: `result = HMAC-SHA256(hex_bytes(serverSeed), clientSeed:nonce)` scanned in 32-bit chunks with the `MAX_FAIR` rejection guard, `result % 10001`, win = `result > target` | `data/dice-master-6700bets.json` — every settled bet | **yes, at full strength** — all 6,700 bets recompute to the recorded roll by exact integer equality on the `0..10000` lattice, 0 mismatches (Step 5). A UTF-8 key instead of hex bytes, a different message order, or any extra term folded into the HMAC breaks every row at once, not a few |
| Commitment convention `SHA-256(hex_bytes(serverSeed)) == server_seed_hashed` | `data/dice-master-6700bets.json` — the 134 revealed commitments (one per epoch with bets) in its 138 seed records | **yes** — 134 of the 137 adjacent rotations verify under the hex-decoded convention, the 3 phase-boundary transitions excluded (Step 1); a UTF-8 preimage fails. The convention is pinned by the data, not chosen by the auditor |
| Multiplier formula at the 0.1% edge tier `0.999 / ((10000 − target) / 10001)` with the edge factor 0.999 taken from the published fairness page, no operator odds field read | `data/dice-master-6700bets.json` — every winning bet | **yes** — the served multiplier equals the formula rounded to the nearest 1e-18 unit for all 6,700 bets, integer equality (Step 9) and the derivation reads only `request.target`; the operator `win_chance` field is compared (Step 10), never used |
| Every captured bet is in Duel's 0.1% edge tier | `data/dice-master-6700bets.json`: `effective_edge` = 0.1 in the bet-time response on 6,700 / 6,700 bets. Read against E14 (the duel.com dice config as fetched 2026-10-05 in a logged-in session, read-only GET, 177 days after the capture), every captured stake would also be in its range's 0.1% tier; the closest, Phase C at $10 / target 9,700, is at 1.55% of that range's $644.25 ceiling (`node scripts/dice-config-tiers.mjs`) | **yes**, for the price — a captured bet served any multiplier other than `0.999 / win_chance` fails Step 9's integer-equality check; under the `(1 − edge) / win_chance` reading of E14 a scaled-tier bet would be priced below it, which is not verified (DL-15). No step reads `effective_edge` |
| The draw is uniform on the `0..10000` lattice — the assumption under every RTP and chi-squared statement | `src/rng.ts` `drawBiasBound()` (Step 19) | **no — this is arithmetic, not data.** `MAX_FAIR` is a whole number of ranges, so the bias is 0 for **every** possible seed; a 6,700-bet sample could never establish that. It is proven from the code constants rather than fitted to the capture, which is why it belongs in a computed bound and not a live goodness-of-fit |
| Each epoch's server-seed commitment was fixed before the bets it covers | ASSUMED — the auditor's capture record plus the forward chain in the dataset. **Step 2 asserts** 138 promotions and 137 forward links, 0 broken, plus the pre-capture link into epoch 0. The chain ORDERS the records; it does not date them | **no — zero power.** A SHA-256 digest carries no time, so these rows are equally consistent with commitments published before the bets and with commitments composed afterwards (DL-4) |
| The 50 bets recorded per epoch are every bet the operator generated under that seed | ASSUMED — the capture rig placed and logged the bets; each epoch's nonces are 0..49 with no gap, reuse or reorder except the four declared capture retries (Step 4) | **no — zero power.** A round generated after the rig's last bet of an epoch and before rotation leaves no client-side trace (DL-5) |
| A player-chosen client seed reaches the HMAC and moves the outcome | `data/dice-master-6700bets.json` — the per-epoch wrong-seed re-derivation (Step 6) and Phase D (Step 15) | **yes** — replacing the client seed with a wrong one changes the roll on every sampled bet (670/670; collisions are held to the lattice rate, bound 2.36), and an empty-seed control over all 6,700 bets collides once against a bound of 5.76; a seed-blind RNG would collide on every bet and hard-fail. Phase D recomputes 500/500 across 10 distinct player-set client seeds |
| The capture is representative of the deployed game — one platform, one account, one currency, one window | ASSUMED — all 6,700 bets come from a single authenticated session on Duel.com. Nothing here observes a second account, currency or window, and no claim extends to them | **no — zero power.** A capture from one account in one window cannot witness another (DL-11) |
| DICE-21 realizes the Poisson-binomial cherry-pick null as exact per-bet lattice win-probabilities + exact aggregate mean/variance with a one-sided normal (CLT) lower-tail. The exact-lattice CDF is computationally intractable for this capture. | ASSUMED — that this exact-moments + CLT-tail realization meets DICE-21 at `full` coverage is this package's reading of the profile, not independently confirmed. The per-bet win-probabilities and the aggregate mean/variance ARE exact (Step 17, re-derived from the revealed seeds); only the tail is a normal approximation to the exact null | **partially.** The captured early window (50 nonces × 134 epochs) sizes the aggregate for the CLT, and the direction split (71 below / 63 above) and detection power (16.3 pp at 80%) are reported; but the exact tail is not computed here. A single-target-per-epoch re-capture would make the exact CDF tractable |

**Rows marked ASSUMED are where this package is thinnest.** Each names what holds the premise up and what would close it; two are inherent to any client-side commit-reveal capture (commitment chronology, trailing withholding), and one is a scope statement.

### Declared limitations register

Everything this package knows it cannot prove, with its measured magnitude where one exists. A limitation missing from this list is a defect in this list.

| # | Limitation | Magnitude (measured) | Why it is not closed here |
|---|---|---|---|
| **DL-1** | **Four capture-retry nonce gaps.** In four epochs the live capture missed exactly one nonce (nonce 50 present, one of 0–49 absent). Each is reconstructed from the revealed server seed, whose SHA-256 matches the commitment the capture recorded before that epoch's first bet, so the revealed seed determines the outcome — but the auditor did not witness the roll live. Step 4 reports this as a **capture-origin FLAG**, not a PASS. | 4 of 134 epochs, one bet each; 4/4 reconstructed via commit-reveal, 0 unverifiable. | Verdict-neutral by construction (the roll follows from a revealed seed consistent with that commitment; that the commitment preceded the bet rests on the capture record, DL-4). Closed only by a capture that observes all 50 rounds of every epoch live. |
| **DL-2** | **The Phase A–C client seeds are generated by `Math.random()`, which is not a CSPRNG.** The generator is fully disclosed — the capture rig's methodology is shipped in this package as `capture/capture-auto.reference.js` (a reference record, not a runnable tool) and its `generateClientSeed()` (lines 256–260) draws each 16-character client seed from `Math.random()`. The seeds are recorded per bet and every roll recomputes from them, so the limitation is not disclosure but strength: `Math.random()` is not a cryptographically secure PRNG. | 6,200 of 6,700 bets. | Nothing in the settled data distinguishes a strong generator from a weak one. **Captured before the standard:** the capture ran 2026-04-11; the CSPRNG requirement (profile DICE-06) dates from the 2026-09-23 standard. No verifier change can make the generator a CSPRNG, so DICE-06 stays `partial`; the client seed is shown to be READ by Step 6's wrong-seed and empty-seed controls at the lattice-predicted rate. Closed by deriving the auditor's client seeds from a CSPRNG, or from a published, independently timestamped commitment. |
| **DL-3** | **The Phase D client seeds are predictable in shape.** Phase D used `'pfaudit'` + `Date.now().toString(36)` (`capture/capture-auto.reference.js` lines 344, 363) — a base-36 millisecond timestamp. An operator holding the capture window already knew every later Phase-D client seed when it committed the corresponding server-seed hashes. The 10 exposed epochs, each 50 bets at target 9,700, are: `pfauditmnugzvwf` (2026-04-11T15:08:57.279Z), `pfauditmnuh1gzz` (15:10:11), `pfauditmnuh2l4f` (15:11:03), `pfauditmnuh3p8v` (15:11:55), `pfauditmnuh4u53` (15:12:48), `pfauditmnuh5y9j` (15:13:40), `pfauditmnuh72dz` (15:14:32), `pfauditmnuh8ezz` (15:15:35), `pfauditmnuh9j4e` (15:16:27), `pfauditmnuhao0n` (15:17:20). | 10 epochs, 500 bets. Step 15 measures the seed COUNT (10 distinct) and cannot measure unpredictability. | Cherry-pick containment for these epochs rests on the Pass 2 consistency check rather than on construction. Closed by a capture whose Phase-D client seeds are drawn unpredictably *after* the relevant commitment. |
| **DL-4** | **The commitment chronology has no independent witness.** Step 2 asserts the forward chain and the pre-capture link, which ORDER the records. A SHA-256 digest carries no time. The only timing evidence is the capture's own record: each epoch's active commitment was recorded before that epoch's first bet (134/134 epochs with bets), which holds only as far as the capture is faithful (DL-11). | The whole capture — 134 epochs, 6,700 bets. | Closed only by the operator publishing commitments to an independently timestamped append-only log. |
| **DL-5** | **Trailing withholding inside an epoch is invisible.** Step 4 asserts each epoch's nonces are 0..49 with no gaps (bar the four declared retries). A round generated after the rig's last bet and before rotation would leave no client-side trace. | Not quantifiable from this capture. | A client-side capture cannot see a round the client never asked for. Closed only by an operator-side round log. |
| **DL-6** | **Phase C exercises the elevated-stake payout path only ~5 times.** Phase C is 200 bets at stake 10 (1,000× the 0.01 used elsewhere), but at target 9,700 the win chance is ~3 %, so only 5 elevated-stake wins settle. Bet-size invariance holds by recomputation (every Phase C bet reproduces in Step 5 and settles in Step 7), but the profile's "≥ 100 wins at ~50 % win chance" floor for an isolated bet-size step is not met. | 200 bets, 5 wins at stake 10 (the dataset carries exactly two stakes, 0.01 and 10). Step 7 prints the floor as ASSUMED with this count. | **Captured before the standard:** the capture ran 2026-04-11; the ≥ 100-win floor (profile DICE-12) dates from the 2026-09-23 standard. What Step 7 does assert: all 200 Phase C rolls recompute, Phase C and the 500 base-stake bets at target 9,700 are served one multiplier value, and the 5 elevated-stake wins settle by the same exact 1e-18-grid rule as every base-stake win. DICE-12 stays `partial`. Closed by a Phase C played at a target near 50 % win chance so ≥ 100 elevated-stake wins exercise the payout path. The $10 Phase C stake sits in the 0.1% edge tier, so this limitation says nothing about scaled tiers (DL-15). |
| **DL-7** | **One Pass-1 statistic — the lag-1 autocorrelation — is a raw stored number, not re-derivable in `npm test`.** The Pass-1 census is now pinned and replayable: Step 16 RE-DERIVES the uniformity chi-squared from the committed 100-bin histogram and each band's RTP from its stored win count, and the runs z from the stored cell counts, all from a census that is a deterministic function of the pinned seeds (byte-reproducible; regenerated and field-diffed by `npm run test:full`). The one exception is `lag1`, the autocorrelation, which needs the un-stored 2,000,000-draw sequence; its z is re-derived as lag1·√n and bounded by its two-sided screen, but the correlation itself is trusted. | 1 statistic (lag-1) of the Pass-1 block. | Does not move the verdict (the screen bounds it; the load-bearing uniformity and edge statistics are re-derived). Fully closed only by storing the sequence's sufficient statistics. **DICE-20 is scored `implemented` — this is the disclosed residual, not a gap.** |
| **DL-8** | **CLOSED (2026-09-22).** Pass 2 previously probed a fixed target 5,000 with count thresholds. It now replays every revealed epoch over 10,000 nonces on the bands each epoch ACTUALLY served, and tests the payout-weighted served-band return standardized by the exact per-bet mean and variance of that return (a scaled Poisson-binomial across seeds); every window is re-derived in verify from the revealed seeds; the exact moments standardize the aggregate return and the rule is a pre-registered one-sided normal (CLT) lower-tail, with the direction split and detection power printed. **DICE-21 is scored `implemented`** (its realization is an ASSUMED load-bearing premise — see the premise table above). The exact-lattice CDF is intractable for this capture; the normal (CLT) tail approximates the exact Poisson-binomial null. | — | Closed. |
| **DL-9** | **Live-bet RTP is not RTP evidence.** | 83.9856 % over the 6,700 bets; per-phase samples are 200–5,000 bets. | A sample this size cannot resolve a 0.1 % edge against a game whose top targets pay ~10,000×. It is variance illustration. The authoritative evidence is the analytical identity plus the simulation. |
| **DL-10** | **CLOSED (2026-09-22).** The strict boundary is now WITNESSED BY DATA — one tie (`result == target`) settled as a loss AND one just-above-tie (`result == target+1`) settled as a win, two live observations straddling the boundary that discriminate the strict `>` rule from `result >= target` — the roll floor (0) is reached by two captured bets (50127125 and 50151385, both losses), the roll ceiling (RANGE-1 = 10,000) is unreached by the 6,700-bet capture (max observed 9,998), and both are witnessed EMPIRICALLY by the pinned 2,000,000-draw uniformity census, whose observed roll span is exactly [0, 10000]. Duel's own Verify-tab code (E13) computes the roll only, not the win rule, so it cannot witness the boundary; the data witness is the anchor. **DICE-17 is scored `implemented`.** | 1 tie + 1 straddle in the data; 2 captured rolls at the floor 0, none at the ceiling; 2,000,000-draw census spans the full lattice. | Closed. |
| **DL-11** | **Dataset provenance and scope.** The SHA-256 pin proves the file has not changed since it was pinned and `src/loader.ts` proves it is the audited population; neither is a statement of origin, and the whole capture is one account, one currency, one window. | The whole dataset — 6,700 bets. | Closed only by an independent capture by a second party. |
| **DL-12** | **Untested adversarial surfaces, disclosed rather than cleared.** Mid-round seed-rotation race (TOCTOU), multi-account seed correlation, outcome dependence on account or session state, timing dependence, selective bet rejection, and server-seed custody. | Not quantified — no capture in this package addresses any of them. | Each needs a capture design this engagement did not run. None is implied to have passed; no scored step touches them. See the [adversarial matrix](#adversarial-matrix). |
| **DL-13** | **CLOSED (2026-09-25).** This row used to say the RNG algorithm was cited to the published fairness page, not to operator source, and that Duel ships no source. That was wrong: Duel publishes its Dice code on the Verify tab (duel.com → Provably Fair → Verify → Expand; `evidence/E03-fairness-verify-dice.png` shows the panel collapsed). The auditor copied it verbatim on 2026-09-25 to `evidence/verify-tab/duel-verify-tab-dice-2026-09-25.js` (E13, SHA-256 `38b257c67d7a342754a201a4cf5220198807c9c1fffe0739b47f099e65950a5b`). It is pinned in `src/operator-verifier.ts`, executed unmodified by Step 5 and the unit tests on all 6,700 bets — its displayed roll, mapped exactly onto the `0..10000` lattice, equals the served roll and `src/rng.ts` on 6,700/6,700 — and `src/rng.ts` cites 12 of its lines, each checked verbatim. | 6,700/6,700 bets agree; 12/12 citations verbatim. | Closed for the published code. Not established: that the live Verify button, or Duel's server, runs exactly this code. |
| **DL-14** | **Roll-under not audited.** Duel Dice also offers a roll-under mode ([E10](#evidence) shows a settled roll-under bet). The capture holds only roll-over bets (`bet_type = "over"` on all 6,700), and the verifier's win rule, lattice enumeration and multiplier formula are written for the over rule, so no roll-under bet is verified and no roll-under win chance, multiplier or RTP is claimed. The ProvablyFair.org docs-site verifier (`verifier-parity/games/dice/derive.js`) carries an under rule (`result < target`, win chance `target / 10001`); no captured bet exercises it. | The whole roll-under mode; 0 captured bets. | Needs a capture of roll-under bets and the under rule in the verifier. Step 18 asserts the audited mode set {over}, and DICE-15 is scored `partial`. |
| **DL-15** | **Scaled edge tiers not audited.** In E14 (the duel.com dice config, `GET /api/v2/dice/config`, as fetched 2026-10-05 in a logged-in session, read-only GET; [Scaling edge](#scaling-edge)) the dice edge rises with stake from 0.1% up to 1.0%. Every captured bet is in the 0.1% tier, so no scaled-tier multiplier, payout or RTP is verified. | 10,590 of E14's 10,712 tiers (every tier after the first in each of its 122 ranges); 0 captured bets above the 0.1% tier. | Closed by a capture across the ladder with the config fetched in the same session, plus a step that checks each bet's served edge against that pinned config. E14 alone cannot close it: it was fetched 177 days after the capture. |

### Recommendations

| ID | Recommendation | Detail |
|----|----------------|--------|
| R-1 | drand integration (medium priority) | Dice uses pure HMAC-SHA256 with no external randomness beacon (`drand_round` is null in all bets). Integrating drand, or an equivalent public randomness beacon, as an additional RNG input would eliminate the theoretical seed cherry-picking risk by making server seed selection verifiably unpredictable, removing the residual operator trust requirement for seed selection |
| R-2 | Multi-account audit (future scope) | This audit used a single test account. A future scope should include at least two funded accounts, comparing server seed hashes across accounts to detect reuse; closes the multi-account cherry-pick attack surface |
| R-3 | Target range disclosure | Targets observed in the dataset run from 200 to 9998; the minimum and maximum allowable targets are not explicitly documented on the fairness page. Publishing the full allowed target range and the exact win_chance and multiplier formula at all boundaries is a player transparency improvement, not a security concern |

What does not need changing: the HMAC-SHA256 algorithm is correctly implemented (hex key decoding confirmed); the RANGE=10001 rejection sampling is unbiased and correctly eliminates modulo bias; the epoch structure (one seed pair until the player rotates it), nonce lifecycle and seed commitment protocol are sound; payout formulas are exact and consistently applied.

## Terms

**Anti-circularity:** verifying theoretical RTP from first principles using only the published payout formulas, without casino-supplied probability data; for Dice in the 0.1% edge tier, `RTP = win_chance × multiplier = 0.999` is an algebraic identity, and the win probability is anchored by a lattice tally (Step 13). **Client seed:** player-controlled string in the HMAC message; changing it triggers an epoch rotation; confirmed to affect results (Step 6). **Commit-reveal:** the server publishes a seed's SHA-256 hash before any bet and reveals the raw seed after the epoch ends. **drand:** a public randomness beacon operated by the League of Entropy; not used by Duel.com Dice (`drand_round: null`). **Epoch:** the bets placed under one (serverSeed, clientSeed) pair, from the rotation that activates it to the player's next rotation, nonces counting from 0. This capture rotated after every 50 logged bets, so its epochs hold 50 bets each, at nonces 0–49 (0–50 in the 4 capture-retry epochs, DL-1). **HMAC-SHA256:** `HMAC-SHA256(key=hex_decode(serverSeed), message=clientSeed:nonce)`, the RNG output. **House edge:** 0.1% flat across all roll-over targets in the 0.1% edge tier, which holds every captured bet, set by the 0.999 factor in the multiplier (RANGE=10001 sets the win chance and cancels out of the RTP); above that tier, the duel.com dice config as fetched 2026-10-05 in a logged-in session (read-only GET; E14) raises it with stake (see Scaling edge). **Multiplier:** `amount_won = amount × multiplier`, computed as `0.999 / win_chance` in the 0.1% edge tier. Above it, `(1 − edge) / win_chance` is consistent with E14's tier boundaries; E14 holds no multiplier, and this is not verified (DL-15). **Nonce:** per-bet counter within an epoch. **RANGE:** the 10001 discrete outcomes, results in [0, 10000]. **Rejection sampling:** discarding chunks in the biased zone ([MAX_FAIR, 0xFFFFFFFF]) so all 10001 outcomes are equally probable. **Result:** the integer RNG output in [0, 10000]; a roll-over bet at target `t` wins if `result > t`. Duel also offers roll-under bets, which this audit does not cover (DL-14). **RTP:** expected (theoretical) or observed fraction of stake returned; label which; 99.9% theoretical for every roll-over target in the 0.1% edge tier. **Scaling edge:** the stake-dependent edge in Duel's dice config. In the duel.com dice config as fetched 2026-10-05 in a logged-in session (read-only GET; E14), each win-chance range has a 0.1% tier up to the stake whose potential profit at the range's longest odds is about $25,000, then rises in 0.01% steps to 1.0%, or to between 0.11% and 0.93% where the $3m max bet ends the ladder first (targets 2–799); not audited here (DL-15). **Server seed:** 32-byte (64 hex character) value used as the HMAC key, committed by SHA-256 before any bet and revealed after the epoch. **Win chance:** for a roll-over bet, `(10000 − target) / 10001`, confirmed to 14 decimal places against all 6,700 API responses.

## Release history

| Release | What changed | Verdict |
|---------|--------------|---------|
| `v1.0.0` | The original audit, published 4 June 2026. | PROVABLY FAIR — Full Pass |
| `v1.1.0` | Re-certification under Framework 1.1, October 2026, below. The dataset of record is unchanged. | unchanged |

### v1.1.0 — what changed

`supersedes` is v1.0.0, the latest tag read from ProvablyFair-org/duel-dice on 2026-09-28; the release `v1.1.0` and its signature are recorded in [RELEASE-MANIFEST.json](RELEASE-MANIFEST.json).

- **Scored steps: 18 in v1.0.0, 21 now.** The verdict is unchanged, PROVABLY FAIR — Full Pass. The dataset of record is byte-identical to v1.0.0. New: Configuration Coverage (target space, stake levels, direction mode), Draw Bias Bound (Sampling Uniformity), Multiplier Monotonicity & Bounds, and Live-Sample Fit (informational). The artifact pins v1.0.0 checked in its Step 18 are checked in Step 12 (Dataset Hash & Artifact Value Domains).
- **Step 4 (Nonce Audit) is now a capture-origin FLAG.** It reports the same 4 capture-retry epochs v1.0.0 reported, each reconstructed from a revealed server seed whose SHA-256 matches the commitment the capture recorded before that epoch's first bet. A capture-origin FLAG is disclosed and does not move the verdict; the step passed in v1.0.0.
- **RTP claim table, scored.** `outputs/rtp-claim-table.json` scores every integer target from 2 to 9,998 (roll over) in the 0.1% edge tier against a flat 99.9% claim (Duel's fairness page: payout multiplier = 0.999 / win chance); under RTP-CLAIM 1.2.0, switched on, the outcome is scored on Step 13. Outcome: pass (true minimum 99.900000%, true maximum 99.900000%).
- **Simulation redesigned:** convergence is now measured over 10 served bands × 1,000,000 bets instead of 98 targets × 1M, so the chart and its final mean RTP (99.922% → 99.761%, theoretical 99.9%) changed. Chart.js 4.4.7 is inlined instead of loaded from cdn.jsdelivr.net.
- **Run metadata removed (2026-09-24):** the `generatedAt` field was removed from the verifier artifacts, re-emitted with every value unchanged.
- **Screenshots E04 and E10:** other players' usernames (the Player column of the live-bets table and, in E10, the bet owner's name and avatar) are masked with solid boxes; every other pixel is unchanged. The captured and masked SHA-256s are kept in the [Evidence](#evidence) section.
- **Added:** 19 Markdown report files, `LICENSE` (MIT), `.nvmrc` (Node 22), `RELEASE-MANIFEST.json` (written by `scripts/release-manifest.mjs`) and the mutation battery (`npm run mutate`, `tests/mutations.json`).

### 4 October 2026 — consolidated documentation

The 19 Markdown chapters and the previous README and MANIFEST were reduced to **README.md and this MANIFEST.md**. Repeated explanations and superseded figures were removed; evidence files, the captured dataset, the draw and settlement logic and every scored result were retained. Documentation references in the profile-coverage map (`src/profile-map.ts`) and the RTP claim source (`src/rtp-settings.ts`) now point to the retained sections; `outputs/verification-results.json` and `outputs/rtp-claim-table.json` were regenerated with the package's own commands, the claim-table pin, the standalone `verify.js` and the release manifest were refreshed, and every numerical result is unchanged. No new casino capture, simulation regeneration or mutation run is asserted for this update.

Where the former chapters disagreed with the verifier's output or the release record, those were kept: the unit-test count is 20 (two former documents said 19); the mutation battery is 45/45 as recorded on 28 September (one said 44/44); `MAX_FAIR` is `10001 × 429453 = 4294959453` with 7,843 rejected values (one chapter gave a different figure and the derived rejection probabilities); a capture-origin FLAG exits 0 (the former README listed every FLAG as exit 2); the multiplier is compared by integer equality on the 1e-18 grid (two chapters still described double-precision or 6-decimal comparisons); the census witnesses the full roll range [0, 10000] (DL-10).

### Where the former chapters went

| Former documentation | Consolidated location |
|---|---|
| `executive-summary.md`, `conclusion.md` | Conclusion and scope; README |
| `game-rules.md`, `system-architecture.md`, `rng-algorithm-analysis.md` | Game and algorithm |
| `payout-verification.md`, `rtp-analysis.md` | Payouts and RTP |
| `findings.md`, `live-parity-testing.md`, `exploit-testing.md`, `edge-case-analysis.md` | Verification results (adversarial matrix under its own heading); Dataset and capture |
| `reproducibility.md` | Reproduce the audit |
| `game-logic-verifiability.md` | Verify a bet; Game and algorithm (player verifiers); Limitations and trust (trust table) |
| `evidence.md` | Evidence |
| `operator-trust-analysis.md` | Limitations and trust; Game and algorithm (commitment chain, client seed origin) |
| `recommendations.md` | Limitations and trust (Recommendations) |
| `glossary.md` | Terms |
| `SUMMARY.md` | Contents; README |

### 4 October 2026 — corrections before publication

No verdict, scored step status or verifier measurement changed. The corrections are to statements that were wrong against the dataset or wider than the evidence:

- **Roll-under scope.** Duel Dice offers roll-under as well as roll-over (E10). The capture holds only roll-over bets, so the conclusion, game rules, payouts, adversarial matrix, Verify a bet and Terms are scoped to roll-over, DL-14 is added and DICE-15 coverage is `partial` (was `full`). Step 18 still passes; its detail now says roll-under is not covered.
- **Payout table.** The multipliers shown at targets 2000, 5000 and 9000 (1.24878×, 1.99800×, 9.99000×) were wrong. They are exactly 1.248874875×, 1.9981998× and 9.990999×; 9.990999 is the multiplier Duel served at target 9000 in the dataset.
- **Seed records.** The 138 seed records reveal 134 commitments, one for every epoch with bets; the 4 rotations with no bets are never revealed. The former statements that every seed record was revealed and that 137/137 adjacent rotations verify were wrong: Step 1 compares 134 of the 137 transitions and excludes the 3 phase-boundary transitions.
- **Nonce range.** The observed range is 0–50 (nonce 50 in the 4 capture-retry epochs, DL-1), not 0–49.
- **Roll floor.** Two captured bets rolled 0. Only the ceiling, 10,000, is unreached by the capture.
- **Evidence.** E04 and E06–E10 are relabelled with what each image shows and carry no phase or dataset claim. E05 showed the same seed modal as E04 and is withdrawn.
- **Scaling edge (5 October).** Duel raises the dice edge with stake from 0.1% up to 1.0% (Duel's dice config, E14), and every captured bet is in the 0.1% tier. The 99.9% RTP, the multiplier formula and Verify a bet are scoped to that tier; bet-size invariance holds for the roll, and for the price only within that tier; the statement that Dice has no multiplier table is removed; [Scaling edge](#scaling-edge) and DL-15 are added. Step 18 says stake levels, not stake tiers. Verify a bet notes that the `effective_edge` on a settled record can differ from the bet-time value, so step 6 takes the edge from Duel's config.
- **Duel's dice config pinned as E14 (5 October).** E14, the duel.com dice config (`GET /api/v2/dice/config`) as fetched 2026-10-05 in a logged-in session (read-only GET), is pinned in `evidence/` with its response metadata, and `node scripts/dice-config-tiers.mjs` prints every Scaling edge figure from it.
- **Commitment timing (5 October).** A hash match and the forward chain are described as consistency checks, not as proof that a commitment was shown before the bets. That timing is attributed to the capture's recorded pre-bet observations, conditional on capture integrity (DL-4, DL-11). Verify a bet tells the player to save the commitment before betting and compare the revealed seed with that saved value. The Step 2 and Step 4 details and two profile notes in `outputs/verification-results.json` carry the same wording. No verdict, step or number changes.
- **House-edge explanation.** The 0.1% edge comes from the 0.999 factor in the multiplier. The earlier text credited it to RANGE = 10001, which only sets the win chance and cancels out of the RTP. No number or verdict changes.
- `outputs/verification-results.json` was regenerated with `PF_EMIT=1 npm run verify` and the release manifest with `npm run release-manifest`; the four hash-pinned artifacts are unchanged. No new casino capture or simulation regeneration is asserted for this update.

### 6 October 2026 — Step 17 early window

No verdict, scored step status or verifier measurement changed.

- **Step 17 early window.** Step 17 scores nonces 0–49 as the early window and 50–9999 as the reference; the early window is the 50-bet captured depth per epoch. The Step 17 detail and its profile note in `outputs/verification-results.json`, the Step 17 row and paragraph under [Verification results](#verification-results) and the bet flow under [Bet flow and seed lifecycle](#bet-flow-and-seed-lifecycle) called nonces 0–49 the captured nonce range. The captured range is 0–50: nonce 50 occurs only in the 4 capture-retry epochs (DL-1), as the 4 October nonce-range correction states. Each now names the early window and the captured range separately, and the Step 17 detail reads the captured range from the dataset. The windows the step computes over are unchanged.
- **Nonce wording.** The S5-7 row in the [Adversarial matrix](#adversarial-matrix) said 134/134 epochs are the contiguous block while the same row disclosed the 4 capture-retry gaps; it now says 130/134 as captured, the other 4 complete once the missed nonce is reconstructed (DL-1). The `nonce` field in [Verify a bet](#verify-a-bet) gave the range as 0..49; it now gives 0..49 in this capture and 0..50 in the 4 capture-retry epochs. No verdict, step or number changes.
- `outputs/verification-results.json` was regenerated with `PF_EMIT=1 npm run verify`, the standalone `verify.js` was rebuilt and the release manifest refreshed with `npm run release-manifest`; the four hash-pinned artifacts are unchanged. No new casino capture or simulation regeneration is asserted for this update.

### 6 October 2026 — seed record, rotation schedule and stake tiers

No verdict, scored step status or verifier measurement changed, and the dataset is unchanged.

- **Seed record `seeds[0]`.** Its plaintext `serverSeed` is epoch 0's own seed, copied from `seeds[1]` by a step outside the capture script that is not recorded in this package; the reference script writes the first rotation with `serverSeed: null`. Nothing said so, while [Dataset and capture](#dataset-and-capture) cited the seed records' timestamps as pre-bet evidence and the dataset row under [Evidence](#evidence) gave the file as capture output. Both, and the Step 1 row, now disclose it, and the `at` on `seeds[0]` is described as dating its commitment, not that plaintext. The comments in `src/loader.ts` say the same.
- **Rotation schedule.** The Draw section and the bet flow said an epoch is 50 bets and that the server seed is rotated after 50 bets, the S5-7 row called the block 0..49 operator-declared, and Terms and Recommendations described a 50-bet epoch. The 50-bet epochs are the capture's rotation schedule (`BETS_PER_EPOCH = 50` in the capture reference); in the 4 capture-retry epochs Duel served nonce 50 under the same seed. Each now describes the 50 bets as the capture's rotation schedule, and the bet flow says the previous seed is revealed when the player rotates.
- **Stake tiers.** The overview, the last sentence of [Win chance, multiplier and house edge](#win-chance-multiplier-and-house-edge), the README, the Step 7 detail and the DICE-12 profile note said stake sets Duel's edge tier, and the premise table said a scaled-tier bet is priced below `0.999 / win_chance`. Every captured bet is in the 0.1% tier (DL-15). Each now attributes the tier ladder to Duel's dice config (E14) and says which tier Duel's server applies above the 0.1% tier is not verified. The S5-6 row now says the `(1 − edge)` form above the 0.1% tier is this audit's reading of E14, which holds no multiplier.
- **Exhibit range.** The DICE-30 profile note said the Evidence section numbers exhibits E01–E13; E14 was pinned on 5 October, and it now says E01–E14.
- `outputs/verification-results.json` was regenerated with `PF_EMIT=1 npm run verify`, the standalone `verify.js` and `test.js` were rebuilt with the framework builder and the release manifest refreshed with `npm run release-manifest`; the four hash-pinned artifacts are unchanged. No new casino capture or simulation regeneration is asserted for this update.

### 6 October 2026 — release preparation

- The RTP claim rule `src/rtp-claim.ts` is version 1.1.0, byte-identical to the framework's rule file `core/rtp-claim.ts` (SHA-256 `1bd5ece7…89175a`), with its enforcement switch in `src/rtp-claim-switch.ts` set to false, so the claim table stays information only; in `outputs/rtp-claim-table.json` only `ruleVersion` changed. Steps 6, 16 and 17 now print the false-alarm rate on a fair game of each rule that can move them ([False-alarm rates](#false-alarm-rates)); every rate is within its cap, so no rule, step status, figure or verdict changed. In `outputs/verification-results.json` the operator-code provenance and the DICE-09 note name the auditor instead of an individual, the DICE-22 note dates its policy instead of naming one, and the sentence after the Verification results table now says Step 21 reports a deviation as INFO. The mutation battery was rerun: 45/45 killed.

### 14 October 2026 (second pass) — an RTP miss ends RTP FIGURE OVERSTATED (FIXPASS2 class C3)

No verdict, scored step status, figure or artifact changed.

- **Exit-5 mutations.** `scripts/mutate.mjs` gained `regen` (in the disposable copy: the RTP table rewritten by `src/rtp-settings.ts` and re-pinned, then the committed record re-emitted with `PF_EMIT=1`), `expectExit` (an entry counts as killed only when the run also ends with that exit code) and runner `test` (mocha, then the verifier, as `npm test` runs them). New entries: MC3a (target 9998 priced 1 % lower in the RTP table's model, `src/rtp-settings.ts`: 98.901 %) and MC3b (the claim raised to 100.1 %), each with the table and record regenerated and expected to end RTP FIGURE OVERSTATED, exit 5. MC3as and MC3bs make the same changes without regenerating the table and are expected to end exit 1: a committed RTP table that differs from the run, or from its pin, is a reproduction failure, miss or no miss.
- **Battery (Apple M2 Max, 12 cores, Node v22.23.1).** The whole registry (49 entries) in one `npm run mutate` on this tree, 14 October 2026 evening (baseline green): 49/49 killed, 21/21 scored steps covered. On 15 October `--only` (now taking several comma-separated substrings) reran the four C3 entries and every entry naming Step 13, the RTP-claim step (M13, M13b, M13c, MC3): 7/7 killed; MC3a and MC3b ended `VERDICT: RTP FIGURE OVERSTATED`, exit 5; MC3as and MC3bs exit 1 with the committed table reported as differing from the run.

### 14 October 2026 — Methodology v1.1

No draw check, scored step status, figure or verdict changed. The dataset and the four hash-pinned artifacts are unchanged.

- **Framework 1.1.** The audit is re-certified under ProvablyFair.org Framework 1.1 (decision D1); the release manifest's `framework` field and the release row above say 1.1.
- **RTP-CLAIM 1.2.0, switched on.** `src/rtp-claim.ts` is the framework's rule 1.2.0, byte-identical to `core/rtp-claim.ts` (SHA-256 `c9a9c1c4…5f131c`), and `src/rtp-claim-switch.ts` is set to true (decision D3). The outcome is scored on Step 13 (DICE-19): a house-side miss would be an operator-origin FLAG on that step and the verdict RTP FIGURE OVERSTATED, exit 5, never NOT PROVABLY FAIR. The claim source now opens with the place it is shown, the fairness page, one of the rule's six places. Outcome: pass, as before. In `outputs/rtp-claim-table.json` only `ruleVersion` and the source wording changed.
- **Profile 1.0.2.** The Dice profile version this suite cites is 1.0.2 (decision D6, approved as cited; the `-draft` suffix is dropped, no check changed). In `outputs/verification-results.json` only `profileCoverage.profileVersion` changed.
- **S5 level.** The [Adversarial matrix](#adversarial-matrix) states the S5 level received: the fairness-integrity matrix; game-integrity testing was not commissioned (decision D5).
- **Exit 5** is added to the exit codes under [Reproduce the audit](#reproduce-the-audit).
- `outputs/rtp-claim-table.json` was rewritten with `npm run rtp-claim:write` and re-pinned, `outputs/verification-results.json` regenerated with `PF_EMIT=1 npm run verify`, the standalone `verify.js` and `test.js` rebuilt with the framework builder, and the release manifest refreshed with `npm run release-manifest`. The mutation battery was rerun: 45/45 killed, 21/21 scored steps covered.

### 19 October 2026 — review corrections

No draw check, scored step status, figure or verdict changed. The dataset and the four hash-pinned artifacts are unchanged.

- **Release wording.** The README and this overview no longer describe the release as a draft or not yet released; the release, `v1.1.0`, and its signature are in [RELEASE-MANIFEST.json](RELEASE-MANIFEST.json).
- **RNG provenance.** `src/rng.ts` was ported from Duel's published Verify-tab code (E13), as its header says. [Conclusion and scope](#conclusion-and-scope), [Draw](#draw) and the README's Rolls row now say so, and none calls the reproduction independent. The comparison with the prior `winna/dueldice` audit now says the algorithm matches it, and the clause that parameters were checked before any code was written is removed.
- **Capture files.** `capture/capture-auto.js`, `capture/capture-v2.js`, `capture/capture-v2.test.js` and `capture/CAPTURE-PLAN.md` shipped without a description; [Dataset and capture](#dataset-and-capture) and the package layout now describe them.
- **Mutation count.** The [Falsifiability battery](#falsifiability-battery) and the DICE-29 profile note cited 45/45, the count before the four exit-5 entries (MC3a, MC3as, MC3b, MC3bs) were added; both now cite the latest whole-registry run, 49/49 on 14 October 2026. The dated entries above keep the counts of their own runs.
- `outputs/verification-results.json` was regenerated with `PF_EMIT=1 npm run verify`, the standalone `verify.js` rebuilt with the framework builder, and the release manifest refreshed with `npm run release-manifest`.
