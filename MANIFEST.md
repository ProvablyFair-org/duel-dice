# Manifest — Duel Dice Audit

- **Audit ID:** PF-2026-DL02
- **Publication date:** 4 June 2026
- **Audit report:** https://audit.provablyfair.org/casino/duel/games/dice/overview
- **Auditor:** ProvablyFair.org
- **Audit dates:** original March 2026 · recaptured April 2026

## Algorithm

HMAC-SHA256 per bet with rejection sampling against a 10,001-bin integer space. The result is an integer in [0, 10000]; win is determined by comparing the integer result to the integer target.

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
payout           = bet × payoutMultiplier(target)      // edge factor 0.999
```

The rejection-sampling step removes the modulo-bias the naive `chunk % RANGE` would introduce, since `2^32` is not a multiple of `10001`. The payout multiplier is derived from the published edge factor (0.999, i.e. flat 0.1% house edge) and the survival probability `(10000 − target) / 10001` — no operator-supplied table.

## Dataset

- **File:** `data/dice-master-6700bets.json`
- **SHA-256:** `3550ffca07a6f7825f96cdd4e3d8c3cd57898b5b5238b9739753a754cff056d6`
- **Total bets:** 6,700
- **Configuration space:** integer targets 2–9998, roll-over direction. Display layer shows `target/100` (i.e. 0.02–99.98); the 98-target simulation sweep uses whole-percent targets 200–9900.

## Verification

- **Verification steps:** 17 scored steps in `tests/verify.ts`
- **Unit tests:** Mocha (`tests/**/*Tests.ts`)
- **Simulation:** 98,000,000 rounds — 98 representative whole-percent targets (200, 300, …, 9900) × 1M rounds each. The closed-form RTP proof covers the full integer target range (2–9998).
- **Anti-circularity:** theoretical RTP independently derived from `survivalProbability × payoutMultiplier = 0.999` for every valid integer target (2–9998) — flat 0.1% house edge confirmed across the full target range; the 98-target simulation provides representative coverage.
- **Expected `npm test` result:** 17/17 PASS · PROVABLY FAIR — Full Pass

## Reproducibility

Cloning this repo at the publication commit and running `npm install && npm test` reproduces the entire audit pipeline. The dataset hash is verified at startup; the verifier recomputes every roll from `(serverSeed, clientSeed, nonce)`; the simulation sweeps 98 representative whole-percent targets (200–9900), while the closed-form RTP proof covers the full integer target range (2–9998).
