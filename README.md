# Duel Dice — Verifier

Independent verifier for the ProvablyFair.org audit of **Duel.com Dice**.

- **Audit report:** https://audit.provablyfair.org/casino/duel/games/dice/overview
- **Audit ID:** PF-2026-DL02
- **Audited:** March 2026 (recaptured April 2026)
- **Algorithm:** HMAC-SHA256 (one call per bet, uint32 mapped to roll value via integer threshold against 10,001-bin survival space)

## What's in this repo

This is the verification codebase. It re-derives every audited Dice roll from the captured dataset and the published algorithm. The full audit report — methodology, evidence, findings, recommendations — lives on the docusaurus page linked above.

## Reproduce

```sh
git clone git@github.com:ProvablyFair-org/duel-dice.git
cd duel-dice
npm install
npm test
```

`npm test` runs the full pipeline: unit tests + 98M-round simulation + 6,700-bet dataset verification. Expected: 17/17 PASS, **PROVABLY FAIR — Full Pass**.

Individual scripts:

```sh
npm run simulate   # 98M-round simulation across 98 representative whole-percent targets (200–9900), roll-over direction; closed-form RTP proof covers the full integer target range (2–9998)
npm run verify     # 17-step verification of the captured dataset
```

## Dataset

- **File:** `data/dice-master-6700bets.json`
- **SHA-256:** `3550ffca07a6f7825f96cdd4e3d8c3cd57898b5b5238b9739753a754cff056d6`
- **Bets:** 6,700 across capture phases (targets 2–99, roll-over direction)

The verifier confirms the dataset hash before running any checks. Tampering with the dataset causes `npm test` to fail at startup.

## License

MIT
