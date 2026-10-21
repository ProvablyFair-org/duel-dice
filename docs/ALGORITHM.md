# Duel.com Dice: clean-room algorithm specification

> Package copy of the ProvablyFair.org audit framework's `games/dice/ALGORITHM.md`.
> It differs from that file only where the file named locations or tracking items
> in the spec author's workspace: those now read as paths inside this package or as
> neutral wording. No rule, number, vector or source note was changed.

Written 20 Oct 2026 for the ProvablyFair.org audit of Duel.com Dice.

This document is the only input an implementer needs to rebuild Duel Dice's
outcome derivation and settlement. It was written without opening any Duel
source code, any port of it, or any copy of Duel's in-site verifier code (see
§8 for the list of files read). Every step names where it came from:

- **PAGE**: Duel's public pages, quoted with location and date.
- **STANDARD**: the standard provably-fair construction used across the
  industry (commit to SHA-256 of a server seed, HMAC-SHA256 keyed by the server
  seed over the client seed and nonce, bytes to integer).
- **DATA**: fixed by testing the standard candidates against the 6,700 live
  bets in `data/dice-master-6700bets.json`
  (captured 11 Apr 2026). The data chose; Duel's code did not.
- **CONFIG**: Duel's public dice config, `GET /api/v2/dice/config`, captured
  5 Oct 2026 as `evidence/E14-dice-scaling-config-2026-10-05.json`.

The pages say what goes in. They do not say how it is combined, so most of §2
was settled by DATA.

---

## 1. Inputs and commitment

### 1.1 Inputs

| Input | Form | Source |
|---|---|---|
| `serverSeed` | 64 lowercase hex characters (32 bytes); kept secret until the seed pair is rotated | PAGE: "Server seed - a random string provided by us" (E02). Form: DATA (all 138 revealed seeds are 64 hex chars) |
| `clientSeed` | text string chosen or accepted by the player | PAGE: "Client seed - a random string provided by you" (E02). The default is 16 characters from `A–Z a–z 0–9 _`, generated in the browser (client-seed-origin.png) |
| `nonce` | non-negative integer; 0 on the first bet after a rotation, +1 on each bet | PAGE: "Nonce - a number that increases with each bet" (E02); "Nonce 0" shown on a fresh pair (E04); `"nonce": 0` in the rotation response (E11). DATA: nonces 0–50, base 0 |
| `bet_type` | `"over"` or `"under"` | PAGE: "Roll Over" (E01, E06–E08), "Roll Under" (E10). DATA: only `over` was captured |
| `target` | integer 0–10000, in hundredths (target 9313 = "93.13") | DATA (request/response `target`); PAGE: displayed with 2 decimals (E06 "98.00" = 9800) |
| `amount` | stake, decimal | DATA |

### 1.2 Commitment

PAGE (duel.com/provably-fair, Overview tab; E02, and fetched and rendered
20 Oct 2026):

> "We then send you the hex-encoded SHA-256 hash of our server seed before you
> place your bets, to prove we won't change our minds."
>
> "After the game, we reveal the unhashed Server Seed. You can verify that: The
> server seed matches the original hash. The combined seeds generated the exact
> result you played."

The page does not say what bytes are hashed. Spec:

```
commitment = lowercase_hex( SHA-256( hex_decode(serverSeed) ) )
```

i.e. hash the **32 raw bytes** that the 64 hex characters encode, not the 64
ASCII characters.

- SOURCE: STANDARD (SHA-256 commitment) + DATA for the encoding.
- Candidates tried: SHA-256 over the ASCII hex string → **0 of 134** bet
  commitments resolve; SHA-256 over the hex-decoded 32 bytes → **134 of 134**
  commitments resolve, covering **6,700 / 6,700** bets.
- Verification: every bet's `server_seed_hashed` must equal `commitment` of the
  revealed seed. The capture also records, at every rotation, the next-seed hash
  shown before the rotation (`nextServerSeedHash`), which becomes the active
  hash after it (E04 shows both "Active server seed (Hashed)" and "Next server
  seed (Hashed)"; E11 shows `server_seed_hashed` and `next_server_seed_hash`).

---

## 2. Outcome derivation

PAGE gives only the inputs, not the combination:

> "Then we combine all of these values to generate a random result for each
> round: Fair result = Server seed + Client seed + Nonce" (E02; same text on the
> live page 20 Oct 2026)

### Step 1: HMAC

```
key     = hex_decode(serverSeed)                        # 32 bytes
message = UTF-8( clientSeed + ":" + decimal(nonce) )    # e.g. "bRNvtSn0hp2uVFRe:0"
digest  = HMAC-SHA256(key, message)                     # 32 bytes
```

- `decimal(nonce)` is the plain base-10 form: no padding, no sign, no
  separators (`0`, `30`, `41`).
- SOURCE: STANDARD (HMAC-SHA256, server seed as key, `clientSeed:nonce` as
  message) + DATA for the key form and the message format.
- Candidates tried (each combined with each of the 8 byte→number mappings in
  Step 2, so 120 combinations in all):
  - key = the 64-character ASCII hex string, or key = the 32 hex-decoded bytes;
  - message = `c:n`, `c:n:0`, `c-n`, `cn`, `n:c`;
  - also plain SHA-256 of `serverSeed + message` for each message format.
- Result on all 6,700 bets: key = **hex-decoded bytes**, message = **`c:n`**
  → 6,700 / 6,700. The best other combination matched 3 / 6,700, which is
  chance level for a 10,001-value outcome.

### Step 2: bytes to roll

```
N     = 10001                          # outcomes 0, 1, …, 10000
LIMIT = floor(2^32 / N) * N            # = 4294959453
for i in 0, 4, 8, …, 28:
    v = digest[i..i+3] read as an unsigned 32-bit BIG-ENDIAN integer
    if v < LIMIT:
        return roll = v mod N
# all 8 chunks rejected: see Open point O1
```

`roll` is an integer in 0…10000. Displayed, it is `roll / 100` with two
decimals (E09: computed roll 791 shown as "7.91"; E10 shows "53.50").

- SOURCE for "first 4 bytes, big-endian, mod 10001": DATA.
- SOURCE for the lattice size 10001: DATA. It is confirmed independently by the
  served `win_chance` (`count / 10001`, see §3) and by the CONFIG bands, which
  run up to 9998 winning outcomes.
- SOURCE for the rejection loop: STANDARD (rejection sampling is the standard way
  to remove modulo bias). The data **cannot** tell rejection apart from plain
  `v mod N`: a first chunk ≥ LIMIT happens with probability 7843 / 2^32 ≈ 1.8 ×
  10⁻⁶ per bet, and **0 of 6,700** captured bets hit it. Both forms give
  6,700 / 6,700. The framework profile (`profile.json`, check DICE-08,
  `reference` field) records an earlier audit's statement "MAX_FAIR = 10001 ×
  429453", which is the same LIMIT. That text was not used to choose the
  mapping (the data chose it), and it is not an operator source. See O1.
- Candidates tried for the mapping:

  | Mapping | Match |
  |---|---|
  | u32 big-endian (first 4 bytes), rejection ≥ LIMIT, mod 10001 | **6,700 / 6,700** |
  | u32 big-endian (first 4 bytes), mod 10001, no rejection | **6,700 / 6,700** (indistinguishable, see above) |
  | u32 little-endian, rejection, mod 10001 | ≤ 3 / 6,700 |
  | float from 4 bytes (Σ bᵢ/256^(i+1)) × 10001, floored | ≤ 3 / 6,700 |
  | float from 4 bytes × 10000, floored | ≤ 3 / 6,700 |
  | whole 32-byte digest as a big integer mod 10001 | ≤ 3 / 6,700 |
  | 5-hex-character windows < 10⁶, mod 10000 | ≤ 3 / 6,700 |
  | 52-bit float (13 hex chars / 2^52) × 10001, floored | ≤ 3 / 6,700 |

- There is no extra round counter: one HMAC per bet on every captured bet. A
  second HMAC (for example message `c:n:1`) would only be needed if all 8 chunks
  were rejected (O1).

### Step 3: independent check against Duel's public Verify page

E09 shows Duel's Provably Fair > Verify page with Game = Dice, client seed
`5icuhQS3ze`, nonce 0, and Game Result **7.91**. The server seed is cut off in
the screenshot, but it can be put back together without guessing. The input box
shows `…99fb0aacfb97c1e6772389e1b3eec2a8d7d6d07488bf745b0f9b2d03714` and the
code panel's input line shows `'7b3c099fb0aacfb97c1e…`. The two overlap by 15
characters, which gives
`7b3c099fb0aacfb97c1e6772389e1b3eec2a8d7d6d07488bf745b0f9b2d03714` (64 hex).
This spec gives u32 = 3985829334 → roll 791 → **7.91**, the same result as
Duel's page. (Only the input-value lines of the code panel are visible in E09.
No code was read from it.)

---

## 3. Win condition and payout

### 3.1 Win condition

```
over : win  ⇔  roll > target        count = 10000 − target
under: win  ⇔  roll < target        count = target          (UNWITNESSED, O2)
```

`count` is the number of winning outcomes on the 0…10000 lattice.

- SOURCE: PAGE for the modes ("Roll Over" E01/E06–E08, "Roll Under" E10);
  DATA for the `over` rule. The recorded `is_win` matches `roll > target` on
  **6,700 / 6,700** bets. The tie case is witnessed once: bet **50147522**,
  target 4614, roll 4614, `is_win = false`. So `over` is strictly greater.
- E10 (a "Roll Under 49.95" bet, result 53.50, payout $0.00) agrees with
  `roll < target` but witnesses only a loss.

### 3.2 Win chance

```
win_chance = count / 10001
```

Served to 18 decimals, rounded to nearest. DATA: **6,700 / 6,700** at 18
decimal places, rounding half-up or half-even. Truncation matches only
2,539 / 6,700 and rounding up 4,161 / 6,700, so both are ruled out. No captured
value falls exactly on a rounding tie, so half-up and half-even cannot be told
apart; either is correct for every captured bet.

UI display: win chance as a percentage with 2 decimals. E06 shows "2.00" for
count 200 (200/10001 = 1.9998 %).

### 3.3 House edge (scaling edge)

The edge `e` is looked up in the CONFIG `scaling_edge` table:

```
band = the entry whose key K and range_to satisfy  K ≤ count ≤ range_to
       (keys run contiguously from 2 to 9998; the bands do not overlap)
tier = the tier in band.tiers with  min_bet ≤ amount < max_bet
e    = Decimal(tier.house_edge)            # e.g. "0.001" = 0.1 %
```

- SOURCE: CONFIG for the table; DATA for keying on `count`. The served
  `effective_edge` (a percentage, 0.1) equals `100 × e` from this lookup on
  **6,700 / 6,700** bets.
- Coverage: every captured bet fell in the first tier (`0.001`). That includes
  the 200 Phase C bets at 10 USDT (count 300 → band 251–300, tier 0–644.25 at
  0.001). Tiers above 0.1 % and the tier boundary rule (`<` or `≤` at max_bet)
  are not witnessed (O3).
- The UI labels the game "Zero Edge" (E01, E06–E08). The edge actually served
  on every captured bet was 0.1 %. Duel's `/about/zero-edge` page (rendered
  20 Oct 2026) is a general essay on house edge and gives no per-game figure.

### 3.4 Multiplier

```
multiplier = (1 − e) / win_chance = (1 − e) × 10001 / count        (exact rational)
```

Served to 18 decimals, rounded to nearest: **6,700 / 6,700** (half-up or
half-even; truncation 4,197 / 6,700, rounding up 4,336 / 6,700).

- SOURCE: STANDARD (multiplier = (1 − edge) / probability) + DATA (exact match)
  + CONFIG (e).
- UI display: 4 decimals. E06 shows "49.9550" (count 200: 0.999 × 10001 / 200 =
  49.954995). E07 shows "99.9100" (count 100). E08 shows "33.3033" (count 300).
  All three agree. E01's default panel does not (O4).

### 3.5 Payout

```
win : amount_won = round18( amount × (1 − e) × 10001 / count )   # exact rational, then round once
loss: amount_won = 0
```

- Use the **exact** multiplier, not the 18-decimal served one. DATA: exact
  multiplier, rounded to nearest at 18 decimals → **2,519 / 2,519** wins.
  Amount × the already-rounded served multiplier → only 2,503–2,504 / 2,519.
  Truncation → 1,303 / 2,519. Losses pay 0 on **4,181 / 4,181**.
- `amount_won` is served with trailing zeros removed ("0.3330333",
  "333.0333"). Compare numerically, not as strings.
- SOURCE: STANDARD (stake × multiplier) + DATA (precision and rounding).
- UI "Profit on Win" = amount × multiplier − amount (E08: 10 × 33.3033 − 10 =
  323.03).

### 3.6 Fields an implementation must not read

`result`, `is_win`, `win_chance`, `multiplier`, `effective_edge` and
`amount_won` are the operator's claims, to be checked. The derivation reads
only `serverSeed`, `clientSeed`, `nonce`, `bet_type`, `target`, `amount` and the
CONFIG table.

---

## 4. Source per step (summary)

| Step | Source | Evidence |
|---|---|---|
| Inputs: server seed, client seed, nonce | PAGE | E02 / live overview page, 20 Oct 2026 |
| Commitment = SHA-256, hex output | PAGE + STANDARD | E02 "hex-encoded SHA-256 hash of our server seed" |
| Hash input = hex-decoded 32 bytes | DATA | 134/134 commitments (ASCII form 0/134) |
| HMAC-SHA256, key = hex-decoded server seed | STANDARD + DATA | 6,700/6,700 (ASCII-key form ≤ 3) |
| Message = `clientSeed:nonce`, UTF-8 | STANDARD + DATA | 6,700/6,700 (4 other formats ≤ 3) |
| First 4 bytes, big-endian u32, mod 10001 | DATA | 6,700/6,700; 7 other mappings ≤ 3 |
| Rejection ≥ 4294959453, next chunk | STANDARD | not exercised by the data (0/6,700); O1 |
| Roll display = roll/100 | PAGE + DATA | E09 7.91 ↔ 791; reproduces Duel's Verify page |
| Over: roll > target, tie loses | PAGE (mode) + DATA | 6,700/6,700; tie witnessed (bet 50147522) |
| Under: roll < target | PAGE (mode) only | unwitnessed; O2 |
| win_chance = count/10001, 18 dp nearest | DATA | 6,700/6,700 |
| Edge = CONFIG scaling_edge[count][amount tier] | CONFIG + DATA | 6,700/6,700 (first tier only) |
| Multiplier = (1−e)·10001/count, 18 dp nearest | STANDARD + DATA | 6,700/6,700 |
| Payout = amount × exact multiplier, 18 dp nearest | STANDARD + DATA | 2,519/2,519 wins; 4,181/4,181 losses = 0 |

---

## 5. Test vectors (from the dataset)

Each vector is copied from `dice-master-6700bets.json`, with the server seed
taken from the matching revealed seed record. `u32` is the first four HMAC
bytes read big-endian. Edge e = 0.001 for all five.

**V1: bet 50120986** (Phase A, loss)
```
serverSeed  528555039caf67c0219c9537cf6626c63cb0bfa384b72571410e522773270eb5
commitment  91afc2eb50c2c801865a533f7b2a3177fc46bda00fcb500bd290ff73f09e1832
clientSeed  bRNvtSn0hp2uVFRe     nonce 0     over 9313     amount 0.01
HMAC        91cb700c3aaa8b1844882f2ce3bc7a8500afe54715dc36d27a234f188c264708
u32 2446028812 → roll 4234 → loss
win_chance 0.068693130686931307   multiplier 14.542938864628820961   amount_won 0
```

**V2: bet 50147522** (Phase A, the tie: roll = target loses)
```
serverSeed  9089447ee52c50f7681df2e81d1c18c7511211541d816700d2d9cbf5e21e59e1
commitment  dbd84e4f9c7c7bec84778bef7eb1b40e265d406657d02339ad4443d90e44cb75
clientSeed  TWGFOVLB7Hn0nEYz     nonce 30    over 4614     amount 0.01
HMAC        e833934055d988afdac0159e80b6c813c9d91e1211bfdd211f76284bc596d443
u32 3895694144 → roll 4614 → loss (4614 is not > 4614)
win_chance 0.538546145385461454   multiplier 1.854994244337170442   amount_won 0
```

**V3: bet 50126115** (Phase A, win at the highest won target)
```
serverSeed  62d76145dc7af725c1266e3dba55ab6961bc69126fb3abac92d3a84361d728aa
commitment  34d53ac2b95b6bfe6ba7a013150eff61d5e96e8c2a4f90a377daa0800c93796f
clientSeed  A4pdyxBckF41ia9i     nonce 41    over 9855     amount 0.01
HMAC        693bf2e232516ddc4ffa5b787b7cb5ffafde5969a2ff6b4bda16ce570ce61f14
u32 1765536482 → roll 9947 → win (count 145)
win_chance 0.014498550144985501   multiplier 68.903441379310344828   amount_won 0.689034413793103448
```

**V4: bet 50157310** (Phase C, 10 USDT stake, win)
```
serverSeed  b0ec2ba42759cc0368488642ab663ba527255dd0e7fd0dc81ca76883471069ec
commitment  814e15a1efcd26e802acb4086bdbfd48288fcae3c1f95d47ef1b8acf6e321ed0
clientSeed  6RCe8mGoswFFojub     nonce 31    over 9700     amount 10
HMAC        d5be73c59778355f8c21352d82c35e6d025e5706825e3705ff914fdd91173f59
u32 3586028485 → roll 9919 → win (count 300)
win_chance 0.029997000299970003   multiplier 33.303330000000000000   amount_won 333.0333
```

**V5: bet 50158143** (Phase D, player-set client seed, win)
```
serverSeed  8195d9a7126ba92f95891d7fe360841f7ba29493576eed666b425c9ca1edc130
commitment  2e90e18331cf62073b312e2f8fce9117f73e45167b84fcf905d4777330ccc1b0
clientSeed  pfauditmnugzvwf      nonce 21    over 9700     amount 0.01
HMAC        d3919ab10f163d3c379c3481ef58632aae38060aa25671308e24a148397a0f35
u32 3549534897 → roll 9980 → win (count 300)
win_chance 0.029997000299970003   multiplier 33.303330000000000000   amount_won 0.3330333
```

**V6: Duel's public Verify page** (E09; no bet id, roll only)
```
serverSeed  7b3c099fb0aacfb97c1e6772389e1b3eec2a8d7d6d07488bf745b0f9b2d03714
clientSeed  5icuhQS3ze   nonce 0   → u32 3985829334 → roll 791 → "7.91" (as shown by Duel)
```

---

## 6. Open points the public sources do not settle

- **O1: rejection continuation.** When the first 4-byte chunk is ≥ 4294959453,
  this spec moves to the next 4-byte chunk of the same digest. What happens if
  all 8 chunks are rejected (probability ≈ 10⁻⁴⁶) is not settled; the throwaway
  implementation computes a second HMAC over `clientSeed:nonce:1`, which is a
  placeholder. None of the 6,700 bets exercised any of this, so the data cannot
  tell "rejection" from "plain mod 10001". It decides about 1.8 bets per million.
  To settle it: Duel's written rules, or a bet whose first chunk is ≥ LIMIT
  found by searching nonces on a revealed seed and then checked on Duel's Verify
  page.
- **O2: Roll Under.** The mode exists (E10) but no `under` bet was captured. The
  win rule (`roll < target`), `count = target`, the tie case and the edge lookup
  for `under` all come from the over-mode symmetry, not from data.
- **O3: edge tiers and timing.** Only the 0.1 % tier was exercised. The tier
  boundary (`min_bet ≤ amount < max_bet`) is assumed. The CONFIG was captured
  5 Oct 2026, the bets on 11 Apr 2026: it matches all 6,700 bets, but the config
  that was live on 11 Apr was not captured. The amount's currency basis (USD
  value or token amount) for tier selection is not settled; the bet records
  carry no currency field (the UI in E01/E08 shows a USDT balance).
- **O4: E01 default panel.** E01 shows Multiplier "2.0000", Roll Over "50.05",
  Win Chance "49.95". This spec gives 0.999 × 10001 / 4995 = 2.0002 for target
  5005. A likely reading is that the panel shows the typed multiplier and
  derives the target by flooring the count, but no bet at target 5005 was
  captured, so this is unverified.
- **O5: drand fields.** Every bet carries `drand_round` and `drand_randomness`,
  null on all 6,700. This spec covers only the null case. If Duel ever fills
  them, the derivation may change and this spec says nothing about it.
- **O6: client-seed encoding beyond ASCII.** UTF-8 is the assumption. All
  captured client seeds are ASCII, so non-ASCII seeds are unwitnessed.
- **O7: rounding tie mode.** Half-up and half-even give the same result on every
  captured value (0 values fall exactly on a tie), so the tie mode for
  win_chance, multiplier and payout is unsettled. A tie at the 19th decimal is
  rare but possible.
- **O8: the public page names no algorithm.** "Fair result = Server seed +
  Client seed + Nonce" does not say HMAC, the key form, the separator or the
  mapping. Everything in §2 beyond the inputs rests on STANDARD + DATA (and
  the E09 Verify-page result), not on a written Duel rule.

---

## 7. Reproduction of this spec

The spec was implemented, independently of any audit package, in a throwaway
script (`spec_check.py`, outside the repo) and run on every bet:

```
commitment SHA256(hexdecode(serverSeed)) == server_seed_hashed: 6700/6700
roll = HMAC-SHA256(key=hexdecode(serverSeed), msg='clientSeed:nonce') -> u32BE(bytes0..3) mod 10001: 6700/6700  mismatches=[]
bets whose first 4-byte chunk was >= 4294959453 (rejection path exercised): 0
win flag (over: roll > target): 6700/6700
effective_edge(%) == E14 tier house_edge*100: 6700/6700
win_chance = count/10001 at 18 dp, by rounding mode: {'down': 2539, 'half_up': 6700, 'half_even': 6700, 'ceil': 4161}
multiplier = (1-edge)*10001/count at 18 dp, by rounding mode: {'down': 4197, 'half_up': 6700, 'half_even': 6700, 'ceil': 4336}
wins=2519; amount_won = amount x served multiplier at 18 dp, by mode: {'down': 1316, 'half_up': 2503, 'half_even': 2504, 'ceil': 1313}
wins=2519; amount_won = amount x exact multiplier at 18 dp, by mode: {'down': 1303, 'half_up': 2519, 'half_even': 2519, 'ceil': 1302}
losses paying 0: 4181/4181
```

---

## 8. Files read while writing this spec

Read: `evidence/` E01, E02, E04, E06, E07, E08,
E09, E10, E11 (PNG), `client-seed-origin.png` (shows Duel's client-seed
*generator*, not the dice derivation), E14 config JSON and its `.meta.json`;
`data/dice-master-6700bets.json`;
the audit framework's `games/dice/profile.json`; the live pages
`duel.com/provably-fair` (Overview tab only) and `duel.com/about/zero-edge`,
rendered 20 Oct 2026 with GET and no login.

Not opened: any `verify-tab`, `verifier-parity`, `src/`, `tests/`,
`scripts/`, `verify.js`, `test.js`, `MANIFEST.md` or `README.md` of any Duel
package, any saved Duel JS bundle, or Duel's Verify tab.
