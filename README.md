# Duel Dice — Provably Fair Audit

**Auditor:** [ProvablyFair.org](https://www.provablyfair.org) · **Audit ID:** PF-2026-DL02 · **Release:** `v1.3.0` · **Capture:** 11 April 2026

**Result: PROVABLY FAIR — Full Pass.** All 6,700 recorded rolls, every one a roll-over bet, reproduce from (serverSeed, clientSeed, nonce) to the exact `0..10000` lattice value, and every payout settles exactly. The verifier reports 20 passing steps of 21, one disclosed capture-origin flag and no hard failures. The flag is Step 4: in four epochs the capture missed one nonce on a retried request; each roll is reconstructed from a revealed seed whose hash matches the commitment the capture recorded before that epoch's bets, but was not witnessed live. It is verdict-neutral.

**Scope:** Roll-over bets only. Duel also offers roll-under, which this capture did not exercise and this audit does not cover. In the duel.com dice config as fetched 2026-10-05 in a logged-in session (read-only GET; [E14](evidence/E14-dice-scaling-config-2026-10-05.json)), each win-chance range has a 0.1% tier up to the stake whose potential profit at the range's longest odds is about $25,000. Above that the edge rises in 0.01% steps to 1.0%, or less where the $3m max bet ends the ladder first (see [Scaling edge](MANIFEST.md#scaling-edge)); which tier Duel's server applies above the 0.1% tier is not verified (DL-15). Every captured bet is in the 0.1% tier, so 99.9% is the RTP of that tier, not of every bet. Theoretical RTP is **99.9000% (house edge 0.1%) at every legal integer roll-over target 2..9,998, in the 0.1% tier**, from `win_chance × multiplier = 0.999` with the win probability anchored to a 10,001-point lattice tally. Empirical RTP over the 6,700 bets is 83.9856%; that is variance illustration, not RTP evidence. The capture is one account, one currency, one window. Its auditor-side client seeds were not CSPRNG-generated, seed chronology is witnessed only by the capture's own record, and multi-account behaviour is not witnessed; the [overview's limitations](MANIFEST.md#limitations-and-trust) list all fifteen declared limitations.

## What was verified

| Check | Captured evidence |
|---|---|
| Rolls | 6,700 / 6,700 recomputed by exact integer equality, 0 mismatches; no drand input. The RNG code (`src/rng.ts`) was rebuilt from a written specification ([docs/ALGORITHM.md](docs/ALGORITHM.md)) by an implementer who never opened Duel's code; Duel's published Verify-tab code is run as a second check, not used as the source |
| Payouts | 6,700 / 6,700 settled exactly on the served 1e-18 grid (2,519 wins, 4,181 losses), no tolerance |
| Multiplier and win chance | Multiplier equals `0.999 / ((10000 − target) / 10001)` by integer equality (0.1% tier; every captured bet); win chance exact to 14 decimal places |
| Seed records | 138 seed records; 138/138 next-seed promotions and 137/137 forward links |
| Client seed | Wrong-seed and empty-seed controls change the roll at the lattice-predicted rate; 500 Phase D bets on 10 client seeds recompute |
| Draw bias | `MAX_FAIR = 10001 × 429453` is a whole number of ranges, so the modulo bias is exactly 0 |
| Simulation evidence | 2,000,000-draw uniformity census and 98 targets × 1,000,000 bets (mean RTP 99.922%); Pass 2 on 134 revealed epochs, no cherry-picking detected |
| Player verification | Duel's own Verify-tab code (the second check) and both ProvablyFair.org verifiers reproduce all 6,700 rolls |

Hash matching and the forward commitment chain order the supplied records; they do not date them. Coverage gaps, capture seeds and residual operator trust are retained in the [overview's limitations](MANIFEST.md#limitations-and-trust).

## Run the audit

Open a terminal in the `duel-dice` package directory. Use **Node 22.x**, as declared in [.nvmrc](.nvmrc) and [package.json](package.json).

```sh
npm ci
npm test
```

Expected: **20 unit tests pass; 20/21 PASS + 1 capture-origin FLAG; zero hard failures; PROVABLY FAIR — Full Pass; REPRODUCED; exit 0.** This replays every captured bet, re-derives the simulation statistics from the pinned census and compares fresh verification results with the committed artifacts. It does not regenerate the simulation. The exit code is the verdict: `0` PROVABLY FAIR — Full Pass · `2` PROVABLY FAIR — Conditional Pass · `5` RTP FIGURE OVERSTATED (the RTP-CLAIM rule 1.2.0 found a published RTP figure above the game's real RTP; the draws pass) · `1` NOT PROVABLY FAIR, or a reproduction difference.

**RTP claim (RTP-CLAIM 1.2.0, switched on).** Every roll-over target 2–9,998 in the 0.1% tier is held to a flat 99.9%, taken from Duel's game settings: in [E14](evidence/E14-dice-scaling-config-2026-10-05.json), the duel.com dice config, the first tier of all 122 win-chance ranges is `house_edge` 0.001, and rule 1.2.0 counts a stated edge in the game settings as published (decision D2). Scored on Step 13: PASS, 0 of 9,997 targets beyond the 0.1 pp band ([table](outputs/rtp-claim-table.json)). The Dice bet panel is labelled "Zero Edge" (E01, E06–E08) while the base edge is 0.1%; the rule records that label as a noted line (decision D3), not tested.

```sh
node verify.js                    # the same verdict with no npm install
npm run test:full                 # optional: regenerates the simulation into outputs/run/
node scripts/release-manifest.mjs --check
```

Ordinary runs write to `outputs/run/` and leave the evidence of record intact. See [reproduction details](MANIFEST.md#reproduce-the-audit) for the comparison rules, exit codes, falsifiability battery and deliberate artifact-refresh procedure.

## Verify a bet

These steps are for roll-over bets; a roll-under bet does not verify with `result > target`. Before you bet, save the active server seed (hashed) shown in the Dice fairness panel. After your bets, rotate your seed pair in that panel to reveal the server seed and check that `SHA-256(hex_decode(serverSeed))` equals the commitment you saved. A PASS means the two hashes are equal; the assurance that the seed was fixed before your bet comes from the value you saved before betting, not from the hash match. Then recompute the roll as `v mod 10001`, where `v` is the first 4-byte big-endian chunk of the HMAC-SHA256 digest below `4294959453` (`floor(2^32 / 10001) × 10001`), apply the strict rule `result > target`, and check `multiplier = (1 − edge) / ((10000 − target) / 10001)`, where `edge` is the house edge of your stake's tier in Duel's dice config as served when you bet (E14 is the duel.com dice config as fetched 2026-10-05 in a logged-in session, read-only GET). In the 0.1% tier, which holds every captured bet (each showed `effective_edge` 0.1 in Duel's bet response at bet time; the `effective_edge` on a settled record can differ from the bet-time value, so step 6 takes the edge from Duel's config), that is `0.999 / ((10000 − target) / 10001)`; above it the formula is not verified by this audit (DL-15). The [complete six-step instructions](MANIFEST.md#verify-a-bet) include a runnable function. The [ProvablyFair.org verifier](https://www.provablyfair.org/verify-bets) returns the roll and the server-seed hash from the same fields.

## Files and evidence

There are two documentation files: this README and [MANIFEST.md — consolidated audit overview](MANIFEST.md). The overview contains the game rules, algorithm, RTP derivation, verification results, evidence, limitations and release history.

- [Captured bets](data/dice-master-6700bets.json) — SHA-256 `3550ffca07a6f7825f96cdd4e3d8c3cd57898b5b5238b9739753a754cff056d6`.
- [Verification results](outputs/verification-results.json), [RTP claim table](outputs/rtp-claim-table.json) and [release manifest](RELEASE-MANIFEST.json).
- [Audit report](https://audit.provablyfair.org/casino/duel/games/dice/overview) · [Public repository](https://github.com/ProvablyFair-org/duel-dice) · [MIT license](LICENSE).

The consolidation is recorded in the [release history](MANIFEST.md#release-history).
