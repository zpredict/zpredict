# zPredict — the first shielded prediction market on Zcash

> Built for ZECATHON 2026, Private Markets track. Engine inspired by [Renegade](https://github.com/renegade-fi/renegade)'s MPC dark pool; no Renegade code is used. Privacy audit and how to verify each claim: [PRIVACY.md](PRIVACY.md).

## One line

Bet on an outcome without anyone learning that you bet, which side you took, or how much. Collateral sits in a FROST 2-of-3 shielded escrow that no single operator controls. Orders are secret-shared across three relayers and crossed inside MPC. Winners are paid in one batched, threshold-signed Ironwood transaction to fresh shielded addresses.

## Protocol

### Market
- A market = `{id, question, resolution rule over Zcash chain data, close height, resolve height}`.
- Example: *"Will NU7 activate on mainnet at height 3,543,405?"* · *"Will the Ironwood pool hold > X ZEC at height H?"* · *"Will block H contain > N shielded actions?"*
- **Mirrored markets** (#114, `packages/plugins/polymarket`): a binary Yes/No Polymarket market's question, traded on zPredict's own private book. Its resolution rule is "Polymarket settled Yes", so its oracle is Polymarket (UMA), not chain data (see §4 and PRIVACY.md). Trading closes at a close height before the event; the relayers show Polymarket's price as a reference, fetched server-side.
- Prices are ticks `p ∈ {0.01 … 0.99}`. A matched YES/NO pair locks exactly **1 unit** of collateral and pays 1 unit to the winning side.

### 1. Deposit
- The trader sends fixed-denomination notes (1 / 5 / 25 units) to the escrow's unified address (Ironwood receiver only).
- The memo (`0xFF` app memo, ZIP 302) gives each relayer, encrypted to it alone, the account's public id and **its own share of the account tag** (the tag is a random 16-byte secret made in the browser, the account's only credential). No relayer ever sees the tag, and no order data ever goes in a memo.
- Each relayer scans the escrow with the shared viewing key and its own memo key (`[settlement]` in the relayer config). A deposit is credited once it has 10 confirmations and **all three** relayers' scans found it: the batch handshake intersects what each offers, and the credit enters the circuit as a public per-row input (the amount is visible to every relayer anyway). So no single relayer can credit money the chain does not show. Judge-mode credits are the one exception, accepted only where judge mode is on.

### 2. Order
- In the browser: `order = {market, side, price, size, key = tag}` → split into three XOR shares → each share POSTed **directly to its own relayer** over TLS (onion service optional). No backend ever holds two shares.
- Orders cross only within the batch they land in; they don't rest between batches (the relayers never learn whether an order filled, so they couldn't carry the unfilled ones over without that leaking). On the hosted demo a lone judge has nobody to cross with, so the app offers a labelled **demo counterparty (#103)**: the browser sends, alongside the judge's order, the opposite side at `100 − p` from the *same* account (`submitWithCounterparty`). The two fill against each other at `p`, a self-trade that nets out at resolution. Each is an ordinary order, split and sent like any other; it uses two of the batch's 8 slots only when the judge asks for it, needs no extra table row, and gives the relayers no new powers. No bot, resting book or relayer-side liquidity exists.

### 3. Crossing (MPC, polytune, 3 parties)
- Every batch window, each relayer feeds its shares of a fixed-size batch (**N = 8** order slots for the demo, shared by all open markets and padded with dummy orders) and of the whole balance table into a Garble circuit, with two public inputs: the open market ids (up to 6 per run, padded; see Market capacity) and a credit per table row (deposits and judge credits, which every relayer already sees). Orders only cross within their own market; the same circuit runs whichever markets have orders.
- Inside the circuit: rebuild orders (`s0 ^ s1 ^ s2`) and the table, add the credits, drop orders for unlisted markets, reserve each order's worst case from the row whose key equals the order's tag (unfunded or no such row → dummy), cross YES `p` with NO `q` when `p + q ≥ 1`, at the midpoint `p* = (p + 1 − q) / 2`. YES pays `p*`, NO pays `1 − p*`. Reference: `zpredict_core::clear_with_balances`.
- Output: XOR-shared fill records and updated balances, plus one public number per market, its **clearing price** (volume-weighted YES cost, rounded down; none if nothing crossed) for `lastPrice`/history. **Only fills are revealed to their owners; unfilled orders are never opened.**
- **Balance table limit.** The whole table enters every batch (picking only the accounts that traded would leak them), so its size is fixed per deployment: 32 rows by default (`zpredict_circuit::DEFAULT_ROWS`), 48 on the hosted demo (#99), i.e. that many funded accounts. Each row costs ~6k AND gates (~8.7k with its key and the market slots it touches, at 8 order slots). When the table is full, a Judge-mode claim is refused (`503 table full`) and the app says so; a deposit still gets a row past the cap and waits, and `GET /accounts` tells only its owner (`seat: waiting`), never a public count. Relayer 0 logs the rows used for the operator. A row is freed only when the relayers know it holds nothing: never-used rows, and in future rows whose owner withdrew everything after their markets settled (the withdrawal makes the zero public anyway). The circuit never reveals a balance, so it cannot spot empty rows on its own.
- **Latency.** Runs can't overlap (each batch's balances feed the next), but 92% of a run is polytune's preprocessing, which needs no inputs (M4 Pro, N = 8, 32 rows: 5.7 s of 6.2 s; 3.9 of 4.2 s at 16 rows). So the relayers preprocess one clearing run **ahead** and hold it; a window with work runs only the online part (inputs, evaluation, output: ~0.5 s), then preprocesses the next. What enters a batch, what the MPC computes and what it reveals are unchanged; the held run is used only if all three hold the same one. A judge's fill shows within about half a window plus the online part when a run is ready, or after the next run's preprocessing when the order lands right behind another batch. On the hosted VPS (a batch measured ~37 s, ~6× the M4 Pro) that is ~7 s and up to ~36 s with a 5 s window, down from 62–65 s (`deploy/README.md`). N = 16 would take ~13.5 s per run on the M4 Pro (before account keys).
- Security: polytune protects an honest party's input even if the other two cheat; a cheater can only abort → timeout and re-run.

### 4. Resolution
- At the resolve height (+10 confirmations), each relayer evaluates the rule against **its own node**. At the start of the next batch, over the batch's Noise links, the three swap their resolutions; only a resolution all three computed identically (market, outcome, height, block hash) is signed, FROST 2-of-3 with the **escrow's key shares** (`zpredict_settle::outcome`, plain FROST so the result is an ordinary RedPallas signature under the group key). It is published with the block hash and height, so anyone can recompute the outcome and check the signature (`verifyOutcome` in `@zpredict/sdk`, run in the browser).
- Signed bytes: `"zPredict outcome v1\n"` then the compact JSON `{"market":id,"outcome":"yes"|"no","height":h,"blockHash":"…"}` (`Resolution::message`). The market id fixes the terms (config, or the rolling window). `packages/settle/testdata/outcome-vectors.json` pins it for Rust and TS.
- **Mirrored markets** carry the outside oracle instead of a block: `{"market":id,"outcome":…,"source":"polymarket","conditionId":"0x…"}` (`Evidence::Source`), same prefix. The two forms have disjoint keys, so chain-data messages are byte-for-byte unchanged and one form can never verify as the other; `/markets` then shows `source`/`conditionId` instead of `blockHash`/`blockHeight`, and `verifyOutcome` rebuilds whichever form the market carries. Each relayer reads `GET gamma-api.polymarket.com/markets/slug/<slug>` itself (the `?condition_ids=` filter hides closed markets) and checks the record's conditionId and outcomes `["Yes","No"]`; it resolves once `closed` is true **and** `umaResolutionStatus` is `"resolved"`, YES iff the Yes outcome price is exactly 1 (a 50-50 settlement is NO). A proposed or disputed UMA answer leaves the market unresolved. Agreement and FROST signing are the path above: all three must read the same result. Startup refuses a mirrored market Gamma reports as non-binary or under another conditionId; an unreachable Gamma only warns.
- Signing is **config-gated**: without a sealed share (`frost_share_file`, after the key ceremony #78) a relayer still resolves, and the app shows "Resolved (unsigned)". Nothing is ever signed with a stand-in key.
- **Rolling markets** (`apps/relayer/src/markets/rolling.rs`): every hour of nominal block time, "Will mainnet block H contain ≥ N shielded actions?", H one hour ahead (48 blocks at 75 s; 144 blocks at 25 s from NU7, 3,543,405), trading closing 5 minutes before H, N the median of the 24 blocks before the window so YES/NO are about even. Ids are `1,000,000 + window`, derived from heights only, so the three relayers make the same market without talking. **Cap:** a window's market is only made while fewer than 6 markets (`DEFAULT_MARKETS`, one MPC run) are open at its start: 5 configured markets + 1 rolling market. Resolved rolling markets stay 24 h as history (`keep_resolved`).
- When all three nodes agree a market resolved and on its outcome, the relayers run a second, small MPC program (`zpredict_circuit::resolve`) over **every** position (each batched order's share with its fill share): one unit per winning contract goes into the balance row whose key equals the order's tag, as shares. Nobody learns which positions were in that market, filled or won. It runs once per market; reference `zpredict_core::resolve`.

### Market capacity

One clearing run has `DEFAULT_MARKETS` market slots; more open markets need a second run per window, which doubles every judge's fill time. With three mirrored markets (#114) the demo has 6: NU7, Ironwood, House (Democrats), House (Republicans), Texas Senate (Democrats) and the hourly rolling market. We raised `DEFAULT_MARKETS` from 4 to 6 and dropped only the redundant "block 3,550,000 ≥ 5 shielded actions" market, rather than keep 4 and drop two Zcash markets. Measured with the bench (`--example bench 3 48 8`, three processes, 8 order slots, 48 rows, M4 Pro under load, 2026-10-23):

| Market slots | AND gates | Preprocessing | Online |
|---|---|---|---|
| 4 | 385,321 | 12.3–12.6 s | 1.4–1.7 s |
| 6 | 393,999 (+2.3%) | 12.7–13.0 s (+3%) | 1.5–1.7 s (same) |

Each slot costs ~4.3k AND gates, against ~8k per table row. On the quiet M4 Pro (release, 8.0 s + 0.75 s at 4 slots, #99), +3% is ~+0.25 s of preprocessing; ×5.7 on the VPS, ~+1.4 s on ~46 s of preprocessing, which runs between batches, and ~+0.1 s online. A fill shows ~25 s live, mostly waiting for the window, so that is unchanged. Keeping 4 would have meant dropping Ironwood too and mirroring only the two House markets; a seventh open market falls back to a second run.

### 5. Settlement (withdrawals)
- Winnings stay in the balance table until the owner withdraws: `POST /withdrawals` to all three relayers with the amount, a **fresh shielded address**, and a fresh XOR share of the account tag each, so no relayer learns whose withdrawal it is or can forge one.
- Requests all three hold fill the clearing circuit's withdrawal slots (2 per batch): the amount is taken inside MPC from the row whose key equals the request's tag, only if the row covers it, before orders reserve funds. A public bit per slot says whether it went through.
- **Judge-mode credit never pays out (#104).** A judge claim already shows every relayer the new account's id, so each relayer flags that row as mock when it registers the claim (relayer 0 also from its own judge credits). Each relayer feeds its flags into the circuit as private inputs, and a withdrawal is refused if any relayer flags the row it would debit: one honest relayer that saw the claim is enough. The refusal looks exactly like an uncovered withdrawal (`withdrawn = false`), so nothing new is revealed, and no relayer learns whose request it was. A judge account that later receives a real deposit stays mock, so deposit with a fresh tag. With judge mode on, mock and real accounts trade in the same markets, so a real account can win mock credit; the escrow can then hold less than real accounts are owed, and a payout it can't cover fails and is retried (below). That is fine on testnet. Mainnet refuses judge mode.
- **A failed payout never blocks the market.** The payout round runs after clearing. If it fails (the escrow can't cover the batched payout, a node is down), every relayer logs it, debited requests show `payout: "retrying"`, and relayer 0 backs off (1 min doubling to 1 h) and announces in its hello when to try again. Clearing and the preprocessing ahead (#94) go on; only that window skips preprocessing, because its links may hold a stray payout message.
- Debited withdrawals are paid in one PCZT (v6, Ironwood bundle) to the requested addresses, with change back to escrow; ZIP 317 default fee (each withdrawal keeps 2 half-ticks, 10,000 zats, toward it); wallet-default padding, so a payout has the same shape as any wallet's send. Relayer 0 builds and proves it from the escrow wallet with zcash-devtool; relayers 0 and 1 sign it over the Noise peer links; relayer 0 broadcasts and tells the others the txid. `scripts/relayer-e2e.sh` runs deposit → trade → resolution → withdrawal on regtest through three real relayers.
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
| `POST /orders` body `{orderId: hex32, share: hex52, token: hex32}` | `202 {batch}`: the batch the share joins. `token` is fresh and random per order and relayer |
| `GET /orders/:orderId?token=hex32` | `{status: "pending"\|"filled"\|"unfilled", fillShare?: hex20}`; a missing or wrong token answers `404` like an unknown order, so one relayer (which knows every orderId) can't collect the other two fill shares |
| `GET /accounts/:id?key=hex32` | `{balanceShare: hex16}`; `id` is hex16 (u64 LE), `key` this relayer's share of the tag (else `403`; unknown ids hold a zero share) |
| `GET /memo-key` | `{relayer: 0\|1\|2, memoKey: hex64}`: this relayer's X25519 public key for its slot in the deposit memo |
| `GET /group-key` | `{relayer: 0\|1\|2, groupKey: hex64, threshold: 2}`: the escrow's FROST group key, which outcome signatures verify against; `404` while signing is off. The sdk's `getGroupKey` only accepts it if all three relayers serve the same key |
| `GET /view?after=<seq>` | `{items: [{seq, kind: "order"\|"fill", digest: hex32}]}`: one item per share this relayer received, as `BLAKE2b-128(personal "zPredictViewItem", share)`; never the share or the orderId, since all three views are public and their shares would XOR back into every order and tag. The owner finds its own items by hashing the shares it sent. Powers the Relayer View |
| `POST /judge/claim` body `{account: hex16, keyShare: hex32}` | `200 {}`: **mock**, testnet only (see below); `409` for a known id |
| `POST /withdrawals` body `{withdrawalId: hex32, share: hex32, amount: half-ticks, address: unified address}` | `202 {}`; only with `[settlement]` on. Fresh share i of the tag goes only to relayer i |
| `GET /withdrawals/:withdrawalId` | `{status: "pending"\|"refused"\|"debited"\|"paying"\|"paid", txid?}` |

`Market = {id, question, plugin, params, closeHeight, resolveHeight, status: "open"|"closed"|"resolved", outcome?: "yes"|"no", outcomeSig?: hex128, blockHash?: hex64, blockHeight?: number, source?: "polymarket", conditionId?: string, rolling?: true, category?: string, event?: {id, title, outcome?}, opensAt?: string, rules?: string, lastPrice?: number, history?: number[], historyAt?: number[], reference?: Reference}`; `blockHash`/`blockHeight` are the block the outcome was computed from (or `source`/`conditionId` for a mirrored market), `outcomeSig` the FROST 2-of-3 signature (R ‖ S) over it (Resolution above), absent until the relayers agree or while signing is off. `rolling` marks the hourly generated markets; resolved ones stay in the list as history. `historyAt` (optional, #117) is the unix time of each `history` price, the batch that crossed (already observable by polling `/markets`), for the app's price chart; without it the chart shows one point per cross.
- Display only, from the relayer config and never signed: `category` ("Zcash network", "Politics"; rolling markets get "Rolling"), `event` (binary markets that share an `event.id` are rows of one multi-outcome event, e.g. the two House-control markets under "Which party will win the House in 2026?"; `outcome` optionally labels the row, else the app shows what differs between the questions), `opensAt` (RFC 3339) and `rules` (plain text). They are not part of a market's terms, so editing them keeps its saved progress.
- `Reference = {source: "polymarket", price, url, updatedAt?, history: [{t, price}]}`, mirrored markets only: Polymarket's Yes price in cents (same unit as `lastPrice`), its market page, when Polymarket last updated the record, and a week of hourly prices (`t` in unix seconds) from `clob.polymarket.com/prices-history`. Each relayer fetches it itself at most every 5 minutes (`apps/relayer/src/reference.rs`); the browser never contacts Polymarket and shows the URL only as a plain outbound link.
- `lastPrice` is the public price: cents per YES contract at the market's latest cross (the clearing midpoint, so it can end in .5). `history` is the last N clearing prices, oldest first, one per batch that crossed. Both are absent until the first fill. They are public by design ("price public, participants private"): the batch reveals that a cross happened and at what price, never who, which orders, how many, or what size.

Encodings (all little-endian, identical in `zpredict-core` and `@zpredict/sdk`; `packages/core/testdata/vectors.json` pins them):
- **Order share** (26 bytes): `market u32 | side u8 (0 yes, 1 no) | price u8 (1..=99) | size u32 | key [16]` (the account tag), XOR-split as `[r0, r1, order ^ r0 ^ r1]`.
- **Fill record** (10 bytes): `size u32 | total_cost u32 | side u8 | flags u8 (bit0 = filled)`. Size and cost (half-ticks) are summed over every match, since one order can cross several counterparties at different midpoints; unfilled orders are all zero. Only the owner learns it, by combining all three shares. Orders above `MAX_SIZE` (1,000,000 contracts) are rejected, so `total_cost` always fits.
- **Balance share** (8 bytes): `u64` half-ticks.
- **Account tag**: 16 random bytes chosen by the browser: the account's only credential, so it never leaves the browser whole. Its public label is `id = BLAKE2b-64(personal "zPredictAccount1", tag)` read as `u64` LE. Relayer `i`'s share of it is `sᵢ = BLAKE2b-128(personal "zPredictKeyShare", tag ‖ i)` for `i` = 0, 1 and `s₂ = tag ⊕ s₀ ⊕ s₁`: deterministic, so every deposit and judge claim for an account carries the same shares. Each relayer stores `sᵢ` per id; the circuit rebuilds each row's key from the three and lets an order or withdrawal use a row only if it carries that key (128-bit equality, ~21k AND gates per batch at 8 slots and 32 rows).
- **Deposit memo** (512 bytes, ZIP 302 `0xFF`): `0xFF | 0x02 | epk (32) | slot₀ | slot₁ | slot₂`, then zeros after byte 154. `slotᵢ` = ChaCha20-Poly1305 with a zero nonce, applied to `id u64 LE ‖ sᵢ` (24 bytes) under `BLAKE2b-256(personal "zPredictMemoKey1", X25519(esk, memoKeyᵢ) ‖ epk ‖ memoKeyᵢ)`, with a fresh `esk` per memo. The browser fetches `memoKeyᵢ` from relayer `i` only (`getMemoKeys`) and hands the wallet a ZIP 321 request (`depositUri`: escrow UA, fixed amount, base64url memo). `packages/settle/testdata/memo-vectors.json` pins this format for both `zpredict_settle::memo` and `@zpredict/sdk`. The memo key is generated sealed (`settle memo-key`) and is distinct from the FROST share and the viewing key.
- **orderId**: 16 random bytes from the browser; it links the three shares of one order and nothing else.
- **Withdrawal share** (16 bytes): the account tag, freshly XOR-split like an order; amount and address are public.

`POST /judge/claim` is a testnet-only demo shortcut: the browser makes a tag as for a deposit and sends relayer `i` only the id and `sᵢ`; every relayer registers its share and relayer 0 credits the new row with prefunded test balance, so judges can trade without a faucet. Judge accounts get the same credential as real ones. It is labelled "Mock" in the UI and in `SUBMISSION.md`, and does not exist on mainnet builds.

## Threat model

| Observer | Learns | Doesn't learn |
|---|---|---|
| Chain observer | The escrow address exists and makes batched shielded txs | Who bet, which side, how much, who won |
| Any single relayer | "A 5-unit deposit arrived for account X" (shared viewing key, its memo slot); "someone withdrew A to address Y" (amount and address are needed to pay it) | Orders, sides, prices, positions, balances, whose withdrawal it was, so which deposit belongs to which payout (beyond amount and timing); any account's tag, so it can't trade, withdraw or read a balance as anyone |
| 2 colluding relayers | Same as one for orders; **can move escrow funds** (FROST 2-of-3) | Orders (polytune needs all 3 to collude); account tags (the third share is a PRF of the tag) |
| All 3 colluding | Everything | — |
| Counterparty | That a fill happened at the midpoint | Who you are, your size beyond the fill |
| Network observer | That someone talks to a zPredict relayer | Contents (TLS); your IP if you use Tor |
| Cloudflare (as deployed, until #88) | Everything the three relayers receive, in clear (TLS ends at Cloudflare), plus client IPs: in effect all three relayers colluding | — once the relayer hostnames are DNS-only |
| Demo VM operator | Everything: all three relayers and the DKG ran on one machine | — in production, three independent operators |

**Stated up front:** funds are 2-of-3, order privacy is 3-of-3. The demo deployment concentrates all three on one VM behind Cloudflare; the protocol's guarantees assume independent operators. Live status of every leak-checklist item, with evidence: [PRIVACY.md](PRIVACY.md#leak-checklist).

**Accounts have a credential no relayer sees (#85).** A relayer knows each account's public id and its own share of the tag, never the tag. Orders and withdrawals carry the tag only as fresh XOR shares, and the circuit uses a row only for a request whose shares rebuild that row's key, so a relayer posing as a browser with what it knows (its share, the id) gets a dummy order or a refused withdrawal (`a_relayer_cannot_act_as_an_account` in `packages/circuit`, and the forged withdrawals in `scripts/relayer-e2e.sh`). Balance reads are gated the same way: relayer `i` serves an account's balance share only to a caller holding `sᵢ`.
A dishonest relayer could still try to *choose* the other relayers' shares for an id it learned (from its memo slot or the mempool): a judge claim or a deposit memo of its own for that id, sent before the victim's arrives, would let it know the whole key. Honest shares are deterministic in the tag, so the victim's later deposit or claim shows a different share for a known id; that relayer then **burns** the key (fresh random share every batch). The row is lost, never handed over: the same denial of service a relayer can always cause by aborting the MPC. A relayer altering its own stored share likewise only locks that row.

**Not quantum-recoverable (ZIP 2005).** The escrow's spend authority `ak` is the FROST group key, so its viewing key cannot be derived from a seed. Its `nk` and `rivk` are random, generated once at the DKG (the same construction as `zcash-sign generate`). Escrow notes therefore don't use the ZIP 2005 derivation, which would let a key holder recover them after a quantum break of discrete log. For a hackathon escrow that holds collateral for days, this is acceptable. A production escrow would need a FROST-compatible ZIP 2005 derivation, or would have to sweep to a recoverable key before such a break.

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
│   │   ├── shielded-actions/
│   │   └── polymarket/        # mirrored Polymarket markets (#114)
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
- `polytune` (3-party MPC, Garble language), vendored from `sine-fdn/polytune` rev `47dc378` (MIT) with one change: preprocessing split from the online phase (`vendor/polytune`)
- Network: escrow and settlement on Zcash testnet (`testnet.zec.rocks:443`); market resolution from mainnet (`zec.rocks:443`); Zebra regtest for end-to-end tests (`scripts/relayer-e2e.sh`)
- Landing: Astro (static), MotionSites ASCII Studio design, `@zpredict/ascii` (Three.js, bundled), self-hosted fonts and media
- Web app: Next.js (static export, no server-side logging), same design, self-hosted assets

## Demo deployment

- Three relayers on one VPS (Coolify), each with its own sealed key share and store key; testnet escrow from a FROST DKG run once in a throwaway container. See [deploy/README.md](deploy/README.md).
- Markets: two Zcash headline markets and an hourly rolling market, resolved from mainnet block data (lightwalletd `zec.rocks`), plus three mirrored Polymarket markets on the US midterms (Nov 3), resolved per Polymarket; collateral and settlement on testnet (`testnet.zec.rocks`).
- MPC per batch: 8 order slots, 48 account rows, up to 6 markets. polytune preprocessing runs between batches, so a fill takes one online pass (~25 s live, mostly waiting for the window).
- Judge mode credits mock testnet collateral without a deposit and cannot be withdrawn on-chain.
