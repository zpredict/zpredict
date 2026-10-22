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
- The relayers build one PCZT (v6, Ironwood bundle) paying every winner and every withdrawal to a **fresh diversified address**, with change back to escrow; ZIP 317 default fee; wallet-default padding, so a payout has the same shape as any wallet's send.
- Signing: FROST 2-of-3 with `frost-core` called as a library (`zpredict-settle`), one session for every spend. Before signing, each relayer recomputes the sighash from the PCZT and checks every output against the agreed payout vector (`verify_then_sign`). One relayer proves, off the signing path. Key shares, the viewing key and the escrow wallet are sealed at rest; the DKG is frost-core too, so no share is ever in a clear file (PRIVACY.md). Details and the regtest run are in `packages/settle/README.md`.

## Relayer API

Each relayer is its own origin: `https://r0.zpredict.site`, `https://r1.zpredict.site`, `https://r2.zpredict.site`. The browser (`https://app.zpredict.site`) talks to each one directly; `@zpredict/sdk` exports these types and refuses to run unless the three URLs are three distinct origins, so no host ever receives two shares of anything.

- JSON in and out. CORS allows only the web origin. No cookies or auth headers (`credentials: "omit"`, `no-referrer`). No IP logging, no access logs with client addresses.
- Hex is lowercase; `hexN` means N hex characters. Share i of an order goes only to relayer i.
- Costs and balances are in **half-ticks**: 1 unit of collateral = 200 half-ticks.

| Call | Reply |
|---|---|
| `GET /health` | `{relayer: 0\|1\|2, height: number, batch: number, peers: boolean[]}` |
| `GET /markets` | `Market[]` (below) |
| `POST /orders` body `{orderId: hex32, share: hex36}` | `202 {batch}`: the batch the share joins |
| `GET /orders/:orderId` | `{status: "pending"\|"filled"\|"unfilled", fillShare?: hex20}` |
| `GET /accounts/:tag` | `{balanceShare: hex16}` |
| `GET /view?after=<seq>` | `{items: [{seq, kind: "order"\|"fill", orderId, share}]}`: exactly what this relayer sees; powers the Relayer View |
| `POST /judge/claim` | `{tag}`: **mock**, testnet only (see below) |

`Market = {id, question, plugin, params, closeHeight, resolveHeight, status: "open"|"closed"|"resolved", outcome?: "yes"|"no", outcomeSig?: string, lastPrice?: number, history?: number[]}`; `outcomeSig` is the FROST signature over the outcome and block hash.
- `lastPrice` is the public price: cents per YES contract at the market's latest cross (the clearing midpoint, so it can end in .5). `history` is the last N clearing prices, oldest first, one per batch that crossed. Both are absent until the first fill. They are public by design ("price public, participants private"): the batch reveals that a cross happened and at what price, never who, which orders, how many, or what size.

Encodings (all little-endian, identical in `zpredict-core` and `@zpredict/sdk`; `packages/core/testdata/vectors.json` pins them):
- **Order share** (18 bytes): `market u32 | side u8 (0 yes, 1 no) | price u8 (1..=99) | size u32 | account u64`, XOR-split as `[r0, r1, order ^ r0 ^ r1]`.
- **Fill record** (10 bytes): `size u32 | total_cost u32 | side u8 | flags u8 (bit0 = filled)`. Size and cost (half-ticks) are summed over every match, since one order can cross several counterparties at different midpoints; unfilled orders are all zero. Only the owner learns it, by combining all three shares. Orders above `MAX_SIZE` (1,000,000 contracts) are rejected, so `total_cost` always fits.
- **Balance share** (8 bytes): `u64` half-ticks.
- **Account tag**: 16 random bytes chosen by the browser; the order's `account` field is the tag's first 8 bytes read as `u64`. The tag is the only credential, so it stays in the browser.
- **orderId**: 16 random bytes from the browser; it links the three shares of one order and nothing else.

`POST /judge/claim` is a testnet-only demo shortcut: it credits a fresh tag with prefunded test balance so judges can trade without a faucet. It is labelled "Mock" in the UI and in `SUBMISSION.md`, and does not exist on mainnet builds.

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

**Not quantum-recoverable (ZIP 2005).** The escrow's spend authority `ak` is the FROST group key, so its viewing key cannot be derived from a seed. Its `nk` and `rivk` are random, generated once at the DKG (the same construction as `zcash-sign generate`). Escrow notes therefore don't use the ZIP 2005 derivation, which would let a key holder recover them after a quantum break of discrete log. For a hackathon escrow that holds collateral for days, this is acceptable. A production escrow would need a FROST-compatible ZIP 2005 derivation, or would have to sweep to a recoverable key before such a break.

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

One repo, `zpredict`, Rust and TypeScript side by side.
- **`apps/`** holds anything that runs or deploys.
- **`packages/`** holds the libraries those apps share.
- **`packages/plugins/`** holds one market resolver per market type, all implementing the `Resolver` trait from `oracle`. A new market type is a new plugin; nothing else changes.

Each directory is created when its work starts. Cargo members are listed explicitly in `Cargo.toml`: a `packages/*` glob would also catch the TS packages and break Cargo. pnpm globs `apps/*` and `packages/*`; it skips folders that have no `package.json`.

```
zpredict/
├── apps/
│   ├── landing/               # Astro public site, MotionSites template                     (Oct 26)
│   ├── web/                   # Next.js app: trade page, Relayer View, judge mode          (Oct 24)
│   └── relayer/               # Rust binary: share intake, scanner, MPC party, FROST signer (Oct 24)
├── packages/
│   ├── core/                  # zpredict-core: order encoding, XOR shares, clearing rule   ← exists
│   ├── circuit/               # Garble clearing circuit + polytune runner                   (Oct 24)
│   ├── settle/                # PCZT + FROST glue for batched Ironwood payouts              (Oct 23–25)
│   ├── oracle/                # Resolver trait, market registry, FROST-signed outcomes      (Oct 26)
│   ├── plugins/               # one resolver per market type                                (Oct 26)
│   │   ├── nu7-activation/
│   │   ├── ironwood-pool/
│   │   └── shielded-actions/
│   └── sdk/                   # TS: order encoding + browser XOR sharing, mirrors core      ← exists
├── deploy/                    # 3 relayers + Zebra regtest (docker compose)                 (Oct 23)
├── Cargo.toml                 # Rust workspace
├── package.json · pnpm-workspace.yaml · biome.json · .husky/
└── DESIGN.md · SUBMISSION.md · README.md · LICENSE
```

## Stack

- Rust crates as above
- librustzcash release of 2026-10-21 (`pczt` 0.10, `orchard` 0.16 with the Ironwood pool, `zcash_primitives` 0.31, `zcash_client_backend` 0.25); `zcash-devtool` `0b3436bb` for wallets, proving and broadcast
- ZF `frost-core` 2.2 / `frost-rerandomized` 2.1 via frost-zcash-demo `53df99c` (RedPallas from `reddsa` at `ed49e9c`): `frost-core` runs as a library for both the DKG and signing, plus our PCZT signer glue (`packages/settle`). frost-client and frostd are no longer used
- `polytune` (3-party MPC, Garble language)
- Network: Zcash testnet via `testnet.zec.rocks:443`; Zebra regtest as the fallback
- Landing: Astro (static), MotionSites template, self-hosted fonts and media
- Web app: Next.js (static export, no server-side logging), MotionSites template, self-hosted assets

## Open questions (answer on Oct 23)

1. Does the pinned `zcash-sign` produce valid v6 transactions on testnet since NU7 activated there (~Oct 4)?
2. How long does polytune take for N = 16 on three small VMs?
3. Is polytune's setup distributed, or does it need a trusted dealer? (affects the threat-model wording)
4. Where do we get testnet ZEC (no confirmed public faucet)?

## After the hackathon

Payout risk is real: the organizer's prize split is marked "PLACEHOLDER", and no judges or terms are published. The engine — FROST escrow + MPC crossing + batched shielded settlement — is what every Zcash market idea needs. Plan to continue as a Zcash Community Grants application framed around one concrete app, with answers to the three gaps ZCG has rejected FROST proposals for: secure messaging, key-share backup, lost-participant recovery.
