# zPredict — the first shielded prediction market on Zcash

> Working name. Track: **Private Markets** (Zecathon 2026). Target: track prize + Grand Prize.
> Engine inspired by [Renegade](https://github.com/renegade-fi/renegade)'s MPC dark pool. No Renegade code is used: the repo has no license, and Zecathon rules require all code to be written during the build window.
> Research behind every decision here: `reports/Riset ide proyek Zecathon.md` (kept local).

## One line

Bet on an outcome without anyone learning that you bet, which side you took, or how much. Collateral sits in a FROST 2-of-3 shielded escrow that no single operator controls. Orders are secret-shared across three relayers and crossed inside MPC. Winners are paid in one batched, threshold-signed Ironwood transaction to fresh shielded addresses.

## Why this, and not a dark pool

| | Dark pool (previous plan) | Prediction market (this plan) |
|---|---|---|
| Prior art on Zcash | A "Zcash Dark Pool" repo appeared Oct 21 | **None** — GitHub search for "zcash prediction market" is empty |
| Demand | OTC desks | Polymarket traders getting doxxed; Zcash community already bets on grant outcomes on Seer (not private) |
| Second asset needed | USDC via NEAR Intents: transparent-only ZEC, no testnet, refund address public → **disqualification risk** | **None** — ZEC-only collateral, no transparent hop anywhere |
| Oracle | Price feeds | Markets resolved from **Zcash chain data**, which judges can verify themselves |

The engine (FROST escrow + secret-shared orders + MPC crossing + batched settlement) is the same; only the matching module changes. The dark pool stays a 1-day switch until Oct 25.

## How we win

Judges see four things — the description (read first), the repo, a demo they can open, a 2-minute video — and score Privacy (pass/fail), Usefulness, Execution, Originality.

| Criterion | What judges must see | Our deliverable |
|---|---|---|
| **Privacy** (a leak = disqualified) | Zero leaks, and proof we looked | No transparent address anywhere in the product · `PRIVACY.md` with every data flow and the leak checklist below · static frontend, no third-party requests, no analytics, no IP logs |
| **Usefulness** | Someone uses it Monday | The Polymarket doxxing story; first markets are ones the Zcash community actually argues about (NU7 activation, Ironwood pool size, grant votes) |
| **Execution** ("working beats ambitious") | It runs, in their browser, now | Hosted testnet relayers on 3 separate hosts + **judge mode** with prefunded testnet wallets; fill in under a minute, no install |
| **Originality** | Not repackaged | First prediction market on Zcash; first 3-party MPC + FROST-Ironwood settlement engine in the ecosystem |

**The winning moment** (the 20 seconds judges remember): a split screen. Left: the trader buys YES. Right: the three relayers, each showing only random-looking shares, and the block explorer showing one shielded transaction with nothing readable. "None of these machines knows what you bet."

### Ways we lose (and the guard)

| Loss | Guard |
|---|---|
| A judge finds a leak → DQ | Leak checklist below; self red-team on Oct 27; threat-model table in the README and the video |
| Demo dead during judging (Oct 29 – Nov 22) | 3 hosts, health page, auto-restart, testnet top-up script |
| FROST signing broken on post-NU7 testnet | Decided fallback: Zebra regtest with Ironwood active (see ladder) |
| Judges can't tell what's real | "Real / Mock" section in the description |
| Saved as draft, not submitted | Submit Oct 28 by 12:00 UTC; screenshot "Project submitted" |

## Protocol

### Market
- A market = `{id, question, resolution rule over Zcash chain data, close height, resolve height}`.
- Example: *"Will NU7 activate on mainnet at height 3,543,405?"* · *"Will the Ironwood pool hold > X ZEC at height H?"* · *"Will block H contain > N shielded actions?"*
- Prices are ticks `p ∈ {0.01 … 0.99}`. A matched YES/NO pair locks exactly **1 unit** of collateral and pays 1 unit to the winning side.

### 1. Deposit
- The trader sends fixed-denomination notes (1 / 5 / 25 units) to the escrow's unified address (Ironwood receiver only).
- The memo (`0xFF` app memo, ZIP 302) carries only a random account tag, encrypted separately to each relayer. No order data ever goes in a memo.
- Each relayer scans the escrow with the shared viewing key and credits the account's **XOR-shared balance**.

### 2. Order
- In the browser: `order = {market, side, price, size, account, salt}` → split into three XOR shares → each share POSTed **directly to its own relayer** over TLS (onion service optional). No backend ever holds two shares.

### 3. Crossing (MPC, polytune, 3 parties)
- Every batch window, each relayer feeds its shares of a fixed-size batch (**N = 16**, padded with dummy orders) into a Garble circuit.
- Inside the circuit: rebuild orders (`s0 ^ s1 ^ s2`), check balances, cross YES `p` with NO `q` when `p + q ≥ 1`, at the midpoint `p* = (p + 1 − q) / 2`. YES pays `p*`, NO pays `1 − p*`.
- Output: updated XOR-shared balances and positions. **Only fills are revealed to their owners; unfilled orders are never opened.**
- Security: polytune protects an honest party's input even if the other two cheat; a cheater can only abort → timeout and re-run.

### 4. Resolution
- At the resolve height, each relayer evaluates the rule against **its own node**. Matching results are signed with FROST and published with the block hash, so anyone can recompute them.

### 5. Settlement
- MPC computes the payout vector from the shared positions.
- The relayers build one PCZT (v6, Ironwood bundle) paying every winner and every withdrawal to a **fresh diversified address**, with change back to escrow; ZIP 317 default fee; padded arity.
- Signing: FROST 2-of-3 via the frost-zcash-demo chain (`zcash-devtool` PCZT → `zcash-sign` → `frost-client`/`frostd`), pinned to its `Cargo.lock`.

## Threat model

| Observer | Learns | Doesn't learn |
|---|---|---|
| Chain observer | The escrow address exists and makes batched shielded txs | Who bet, which side, how much, who won |
| Any single relayer | "A 5-unit deposit arrived" (shared viewing key) | Orders, sides, prices, positions, which deposit belongs to which payout |
| 2 colluding relayers | Same as one for orders; **can move escrow funds** (FROST 2-of-3) | Orders (polytune needs all 3 to collude) |
| All 3 colluding | Everything | — |
| Counterparty | That a fill happened at the midpoint | Who you are, your size beyond the fill |
| Network observer | That someone talks to an zPredict relayer | Contents (TLS); your IP if you use Tor |

**Stated up front:** funds are 2-of-3, order privacy is 3-of-3. A judge should read this in our README before they work it out.

### Leak checklist (from the research)
- [ ] No transparent address in any product path (deposits, payouts, refunds, change).
- [ ] Deposits only in fixed denominations; never reveal order size.
- [ ] Payouts batched per epoch to fresh diversified, shielded-only addresses: no deposit→payout timing or amount link.
- [ ] Wallet-default fee (ZIP 317) and expiry (ZIP 315); padded actions.
- [ ] Memos carry no order data, no plaintext tags.
- [ ] Browser shares orders; each share goes straight to its own relayer on its own host.
- [ ] Frontend is static and self-hosted: no CDN, no fonts from third parties, no analytics. Relayers log no IPs.
- [ ] Viewing keys never leave the relayers; never shown in the UI or logs.

## Fallback ladder (decided now, not on Oct 27)

| Component | If it fails | Fall back to |
|---|---|---|
| FROST spend on post-NU7 testnet (deadline: end of Oct 23) | Pinned `zcash-sign` can't build valid v6 txs | Zebra regtest with NU6.3/Ironwood active; testnet only for deposits |
| polytune at N = 16 | Too slow | N = 8, then a coarser tick grid. **Never** a single-server match: that kills the privacy story |
| A relayer aborts | MPC needs all three | Timeout and re-run; signing still works 2-of-3 |
| Judges lack testnet funds | — | Judge mode with prefunded wallets |
| Live run fails on video day | — | Golden-path transaction IDs saved from earlier runs |

## Build plan

| Day | Date | Protocol | Judge-facing |
|---|---|---|---|
| 0 | Oct 22 | Public repo, workspace, pin crate versions | README skeleton, `SUBMISSION.md` |
| 1 | Oct 23 | Testnet coins; **prove the FROST/PCZT Ironwood spend**; polytune 3-party example running | Provision 3 relayer hosts |
| 2 | Oct 24 | Clearing circuit (Garble); relayer service; browser sharing | Trade page skeleton |
| 3 | Oct 25 | Deposit scanning + shared balances; settlement batcher → **end-to-end fill and payout** (demo is safe from here) | Relayer View |
| 4 | Oct 26 | Chain-data oracle + FROST-signed outcomes | Judge mode, health page, top-up script |
| 5 | Oct 27 | Freeze features; leak red-team against the checklist | `PRIVACY.md`, video recorded, description final |
| 6 | Oct 28 | Buffer only | **SUBMIT before 12:00 UTC** + screenshot |

## Monorepo

One repo, `zpredict`: a Cargo workspace for everything Rust, `apps/` for everything web. Crates join the workspace automatically (`members = ["crates/*"]`) and are created when their work starts.

```
zpredict/
├── Cargo.toml                 # workspace
├── crates/
│   ├── zpredict-core/         # order encoding, XOR shares, clearing rule (plaintext reference)   ← exists
│   ├── zpredict-circuit/      # Garble clearing circuit + polytune runner, tested against core   (Oct 24)
│   ├── zpredict-relayer/      # binary: share intake, escrow scanner, MPC party, FROST signer    (Oct 24)
│   ├── zpredict-settle/       # PCZT building + FROST glue for batched Ironwood payouts          (Oct 23–25)
│   └── zpredict-oracle/       # chain-data market resolution                                      (Oct 26)
├── apps/
│   ├── landing/               # public site                                                      ← exists
│   └── web/                   # trade page, Relayer View, judge mode (static TS)                 (Oct 24)
├── deploy/                    # 3 relayers + Zebra regtest (docker compose)                      (Oct 23)
├── DESIGN.md · SUBMISSION.md · README.md · PRIVACY.md · LICENSE
```

## Stack

- Rust crates as above
- librustzcash pinned to the frost-zcash-demo `Cargo.lock` (`orchard` crate carries the Ironwood pool, `pczt`, `zcash_client_backend`)
- ZF `frost-core` / `frost-rerandomized` 3.0, `reddsa` 0.6 (RedPallas), `frostd`
- `polytune` (3-party MPC, Garble language)
- Network: Zcash testnet via `testnet.zec.rocks:443`; Zebra regtest as the fallback
- Web: static TypeScript app (trade page, Relayer View, judge mode), self-hosted assets

## Open questions (answer on Oct 23)

1. Does the pinned `zcash-sign` produce valid v6 transactions on testnet since NU7 activated there (~Oct 4)?
2. How long does polytune take for N = 16 on three small VMs?
3. Is polytune's setup distributed, or does it need a trusted dealer? (affects the threat-model wording)
4. Where do we get testnet ZEC (no confirmed public faucet)?

## After the hackathon

Payout risk is real: the organizer's prize split is marked "PLACEHOLDER", and no judges or terms are published. The engine — FROST escrow + MPC crossing + batched shielded settlement — is what every Zcash market idea needs. Plan to continue as a Zcash Community Grants application framed around one concrete app, with answers to the three gaps ZCG has rejected FROST proposals for: secure messaging, key-share backup, lost-participant recovery.
