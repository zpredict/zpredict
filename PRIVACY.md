# Privacy

Who can learn what from zPredict, through which data flow, and how to check each claim
yourself. This document is the result of an adversarial audit (#15, 2026-10-23); every
claim names its evidence. Protocol details are in [DESIGN.md](DESIGN.md).

**Summary.** Order privacy is 3-of-3 (all three relayers must collude), funds are 2-of-3
(FROST). Nothing transparent touches the product. The audit found two leaks in code that
let *anyone* rebuild every order and account tag; both are fixed in this PR. One
deployment issue with the same effect is still open: Cloudflare terminates TLS for all
three relayers (#88). Until it is fixed, read the hosted demo as "one party can see
everything", which is already true of the single demo VM (see Accepted limitations).

## Who learns what

| Party | Learns | Never learns |
|---|---|---|
| Chain observer | That shielded Ironwood transactions happen; fees are ZIP 317 defaults | The escrow's transactions as such, depositors, bets, sides, sizes, winners, payout recipients |
| Anyone on the internet (public API) | Market list, outcome and signature, one clearing price per market per crossing batch (`/markets`); a digest per share each relayer received, so how many orders arrive and when (`/view`); batch number and peer health (`/health`) | Any share, orderId, account id, balance or fill |
| Network observer (ISP, Wi-Fi) | That your IP talks to `*.zpredict.site`; request sizes and timing | Contents (TLS). With Tor, also your IP |
| **Cloudflare (as deployed)** ⚠️ | **Everything the three relayers receive, in clear**: all three order shares, key shares and withdrawal shares, so every order and tag; plus client IPs (#88) | — until #88 is fixed |
| Hosting provider / VM operator (demo) ⚠️ | Everything: all three relayers run on one VM (`deploy/README.md`) | — |
| One relayer | Each deposit's amount, time and account id (its memo slot, the shared viewing key); each withdrawal's amount, address and time; its own share of every order, fill, balance and account key; the public price | Orders, sides, prices, sizes, positions, balances, any account's tag, whose withdrawal it is (except through request metadata, #90, and amount and timing, #91) |
| Two colluding relayers | As one relayer, and **they can move escrow funds** (FROST 2-of-3) | Orders and tags: the third share is missing |
| All three relayers | Everything | — |
| Counterparty | Its own fill at the midpoint. When a single pair crossed, the midpoint and its own limit give your limit price | Who you are, your size beyond the fill |
| lightwalletd operators (`zec.rocks`, `testnet.zec.rocks`) | The relayer VM's IP syncing the escrow and broadcasting payouts | Users |
| Testnet faucet (`faucet.zpredict.site`, #133) | The time and IP of a drop request (not logged or stored), that a 1-unit deposit went to the escrow, and its txid | The account tag or id (it passes the memo through and cannot open the slots), orders, positions, balances |
| **Cloudflare Turnstile (faucet only)** | Faucet only: your IP and browser signals when you request testnet ZEC; it can link your IP to the time a 1-unit deposit was sent | Orders, positions, balances, your tag. It loads only on `/faucet/`, only after you click "Get testnet ZEC" |
| Polymarket (`gamma-api`, `clob`) | The relayer VM's IP fetching public market records and price history for the mirrored markets, about once per market per 5 min | Users, orders, anything about zPredict's book. The browser never contacts Polymarket |

## Data flows

| # | Flow | Carries | Who sees it beyond the endpoints |
|---|---|---|---|
| 1 | Browser → `app.zpredict.site`, `zpredict.site` | Static HTML/JS/CSS/fonts. No cookies, no analytics, self-only CSP | Cloudflare (proxy) |
| 2 | Browser → relayer *i* `POST /orders` | `orderId`, share *i* of the order, read token *i* | Cloudflare sees all three (#88) |
| 3 | Browser → relayer *i* `GET /orders/:id?token=` | Fill share *i*, served only to token *i* | Cloudflare |
| 4 | Browser → relayer *i* `GET /accounts/:id?key=sᵢ` | Account id, key share *i* → balance share *i* | Cloudflare; the relayer links reads to the id (by design) and to orders on the same connection (#90) |
| 5 | Browser → relayer *i* `POST /withdrawals` | Fresh tag share *i*, amount, address | Amount and address go to every relayer (by design, #91) |
| 6 | Browser → relayers `GET /markets, /health, /view, /memo-key, /group-key` | Public data only | — |
| 7 | Wallet → chain (deposit) | Fixed denomination to the escrow's Ironwood-only UA; 512-byte memo with three slots, each sealed to one relayer's X25519 key and holding `id ‖ sᵢ` | Your wallet's lightwalletd sees your IP; the chain sees a shielded tx |
| 7b | Browser → `faucet.zpredict.site` `GET /status`, `POST /challenge`, `POST /drip` (#133) | A deposit memo the browser built for its own account (as in 7), a proof of work and a Turnstile token. The faucet checks the memo's shape, then pays 1 unit to the escrow from its own shielded wallet (ZIP 317 fee, no transparent part) with that memo unchanged. No per-IP state, no request logs (`grep -rn eprintln apps/faucet/src`), CORS for `app.zpredict.site` only | Faucet only: Cloudflare Turnstile sees your IP and browser signals when you request testnet ZEC; it never sees orders/positions; it can link your IP to the time a 1-unit deposit was sent. The faucet host is DNS-only, so nginx sees your IP (never logged or forwarded) |
| 8 | Relayer ↔ relayer | Batch handshake, MPC (polytune), FROST rounds, payout PCZT. Noise KK on an internal Docker network | Nobody (internal network on one VM) |
| 9 | Relayer → `zec.rocks` (mainnet) | Compact blocks for market resolution | Operator sees the VM IP |
| 9b | Relayer → `gamma-api.polymarket.com`, `clob.polymarket.com` (#114) | Public GETs only, no auth or cookies: each mirrored market's record by slug (outcome, Yes price) and a week of hourly prices. Cached 5 min (Gamma's own `max-age`), 10 s timeout, no retries. Served on as `reference` in `/markets` | Polymarket and its CDN see the VM IP and which markets we mirror (public in our config anyway) |
| 10 | Relayer → `testnet.zec.rocks` | Escrow scan (viewing key stays local), payout broadcast by relayer 0 | Operator sees the VM IP and the escrow's tx |
| 11 | Relayer → disk | Event log of its own shares; sealed key share, viewing key and memo key ([Secrets on disk](#secrets-on-disk)) | Host operator |
| 12 | Logs (relayer stderr → Docker/Coolify; nginx; Caddy) | Relayer: start-up lines and errors that name a market or a failing step, never an order, share, account or address; the escrow scan logs a count of notes sent to the withdraw-only Orchard pool and the block range scanned (#54), never their txid or amount (`grep -rn eprintln apps/relayer/src`). nginx: `access_log off`, `error_log /dev/null`. Caddy: no `log` directive | — |
| 13 | CI/CD | GitHub Actions runs checks; `deploy.yml` calls the Coolify API with `COOLIFY_TOKEN` (an environment secret). Relayer Noise keys live in Coolify as compose secrets, never in git | GitHub, Coolify |

## Leak checklist

| | Item | Evidence |
|---|---|---|
| ✅ | No transparent address in any product path | Payouts are re-encoded Orchard/Ironwood-only (`packages/settle/src/payout.rs` `Payout::parse`); `verify.rs` refuses any transparent, Sapling or Orchard part; the e2e scripts assert `transparent in+out 0` |
| ✅ | Fixed deposit denominations; order size never on chain | `DENOMINATIONS` in `packages/sdk/src/memo.ts`; orders exist only as XOR shares |
| ⚠️ | Withdrawals don't link to deposits | Shielded on chain. Relayers see amount, address and time (#91) |
| ✅ | Wallet-default fee and padding | ZIP 317 fee, wallet-default padding (DESIGN.md §5) |
| ✅ | Memos carry no order data and never the tag | Each slot holds `id ‖ sᵢ`, sealed to relayer *i* (`packages/settle/testdata/memo-vectors.json`) |
| ✅ | Each order share goes only to its own relayer | `submitOrder` + `distinct()` in `packages/sdk` |
| ✅ | Public feeds can't be recombined | **Fixed in #15**: `/view` publishes `BLAKE2b-128` digests, no shares, no orderIds (`apps/relayer/src/state/mod.rs` `view_digest`, test `orders_contract`) |
| ✅ | One relayer can't collect fill shares | **Fixed in #15**: `GET /orders/:id` needs that relayer's random read token (`apps/relayer/src/api/orders.rs`) |
| ✅ | One relayer can't read balances or act as an account | `?key=sᵢ` gate; the circuit checks the 128-bit key (`a_relayer_cannot_act_as_an_account`) |
| ⚠️ | TLS ends at each relayer | Cloudflare terminates TLS for all three (#88) |
| ✅ | No third-party requests from the frontends | One opt-in exception: Cloudflare Turnstile on `/faucet/` only, loaded on click (#133); the CSP allows its origin on that path only and the build gate fails if it appears in any file another route loads (`apps/web/scripts/privacy.test.mjs`). Otherwise self-only CSP (`deploy/static/prepare.mjs`); build gate `apps/web/scripts/privacy.mjs`; Chrome net log on 2026-10-23 shows only `*.zpredict.site`. Mirrored markets (#114): the Polymarket price comes from our relayers; the only Polymarket URL in the app is a plain outbound link (`rel="noopener noreferrer"`, built from relayer data and checked to be `https://polymarket.com/…`), so nothing loads unless clicked, and no logos or images are embedded |
| ⚠️ | No analytics | We ship none, but Cloudflare injects a Web Analytics beacon into HTML (CSP blocks it, no request is made) and sends NEL headers (#89) |
| ✅ | No IP logs | nginx/Caddy settings above; **fixed in #15**: nginx now strips `CF-Connecting-IP`/`X-Forwarded-For`, which it used to pass to the containers |
| ⚠️ | Request metadata doesn't link actions to an account | Timing reduced in #15 (no balance read on fill, ±50% poll jitter); connection-level linkage stays open (#90) |
| ✅ | Viewing keys and key shares never leave the relayers or appear in logs | Sealed at rest; no log line prints them |
| ✅ | No secrets in git | `trufflehog … --no-verification` over all history: one false positive (a commit SHA near the word "SonarQube"); no keys, seeds, UFVKs or `.env` ever committed. #15 untracked a `.pyc` that embedded a local path |

## Audit findings (#15)

| Severity | Finding | Status |
|---|---|---|
| **DQ** | `/view` on all three relayers published every order and fill share with its orderId: anyone could XOR them into every order and account tag (reproduced read-only against production) | Fixed in this PR; live once relayers redeploy |
| **DQ** | `GET /orders/:id` returned the fill share to anyone with the orderId, and every relayer knows every orderId | Fixed in this PR (per-relayer read token) |
| **DQ-risk** | Cloudflare proxies and terminates TLS for r0–r2 and the app | #88 (dashboard: DNS-only) |
| **DQ-risk** | Cloudflare injects a `cloudflareinsights` beacon and NEL headers | #89 (dashboard) |
| Medium | Same-connection and timing metadata links orders and withdrawals to an account id | Partly fixed (jitter, no read on fill); #90 |
| Medium | Withdrawal amount and timing can link deposits to payouts at the relayers | Accepted; #91 |
| Medium | nginx forwarded Cloudflare's client-IP headers to the containers despite claiming otherwise | Fixed in this PR (apply `nginx.conf` on the VPS) |
| Low | Public `/view` digests and `/markets` prices show how many orders arrive and when a market crossed | Accepted by design ("price public, participants private") |
| Low | `/accounts/:id` answers 403 for a known id with a wrong key and a zero share for an unknown id: an existence oracle for ids, which only relayers know | Accepted |
| Low | Committed `__pycache__/*.pyc` with a local path | Fixed in this PR |
| Low | Actions pinned by tag, not SHA | Accepted for the hackathon |

## Accepted limitations

- **Single-VM demo.** All three relayers run on one VPS, so its operator could read every share. The model needs three independent operators.
- **Demo counterparty (#103).** "Take the other side (demo)" places a judge's order and its exact opposite from the same account at the same moment, so the judge trades with themselves (a labelled self-trade that nets out). The two are ordinary orders, but because they arrive together a relayer can guess they come from one browser. It still can't read either, see a fill, or tell which side is the judge's. Real traders don't use it.
- **Cloudflare sees visitor IPs**, and until #88 is fixed, everything sent to the relayers.
- **Relayers see deposit and withdrawal amounts**, addresses and times, and the account id behind each deposit. They do not see which withdrawal belongs to which account, except through #90 and #91.
- **Key-burn DoS.** A dishonest relayer can pre-register shares for an id it learned and then burn that row. Funds stay locked, never stolen (DESIGN.md "Threat model"); the same as aborting the MPC.
- **Public price per market** per crossing batch, and order arrival counts and times through `/view`.
- **Two relayers can move escrow funds** (FROST 2-of-3), while order privacy needs all three.
- **Not quantum-recoverable** escrow notes (ZIP 2005; DESIGN.md).
- **Mirrored markets trust Polymarket.** For the markets that mirror Polymarket (#114), the oracle is Polymarket and its UMA resolution, not chain data: the relayers attest what Polymarket published (each fetches it on its own, and the outcome is signed only if all three read the same result), but nobody can recompute it from a block. A wrong or disputed Polymarket resolution is our resolution. Trading on zPredict stays exactly as private as on any other market.

## Verify it yourself

```sh
# 1. The public views hold digests only. Try to rebuild an order: there is nothing to XOR.
for i in 0 1 2; do curl -s "https://r$i.zpredict.site/view?after=0" | head -c 300; echo; done
#    Expect items {seq, kind, digest}, no "share" and no "orderId" (after the relayers redeploy).

# 2. Fill shares need the browser's token.
curl -s https://r0.zpredict.site/orders/00000000000000000000000000000000   # {"error":"unknown order"}

# 3. Health exposes nothing personal.
curl -s https://r0.zpredict.site/health

# 4. CSP and headers of the app: self-only, connect-src = the three relayers.
curl -sI https://app.zpredict.site | grep -i 'content-security-policy\|referrer\|server'

# 5. Third-party requests: open https://app.zpredict.site/trade/ with DevTools → Network.
#    Every request goes to *.zpredict.site. (A cloudflareinsights tag in the DOM is #89; CSP blocks it.)

# 6. Is TLS still at Cloudflare? (#88) "server: cloudflare" means yes.
curl -sI https://r1.zpredict.site/health | grep -i 'server\|cf-ray'

# 7. Secrets in history (local, never verifies against live services).
trufflehog git file://. --no-verification

# 8. Code: one relayer can't act as an account; the full flow pays to Ironwood only.
cargo test -p zpredict-circuit a_relayer_cannot_act_as_an_account
cargo test -p zpredict-relayer orders_contract
scripts/relayer-e2e.sh      # regtest: deposit → trade → resolve → withdraw; asserts no transparent parts
```

## Secrets on disk

Relayer secrets are sealed with ChaCha20-Poly1305 (`packages/settle` `store.rs`) under a
32-byte store key, `ZPREDICT_STORE_KEY`. The store key only ever exists in the environment:
the scripts generate a fresh one per run, and production injects it as a secret. Each
sealed file binds its label (`frost-key-share`, `ufvk`, `memo-key`, `escrow-wallet`) as
associated data, so one sealed secret can't be passed off as another.

| Secret | Who holds it | At rest | In clear, when |
|---|---|---|---|
| FROST key share (one per relayer) | that relayer | `r{i}-share.sealed` | Only in memory: during the DKG (`settle-payout dkg` seals each share before writing anything), and in a relayer with `[settlement]` on, for as long as it runs |
| Escrow UFVK (shared viewing key) | every relayer | `escrow-ufvk.sealed` | In memory while scanning, verifying or building a payout. Also as a command-line argument for the one `zcash-devtool wallet init-fvk` call that creates the escrow wallet (visible in the host's process list for that moment) |
| Deposit-memo key (X25519, one per relayer) | that relayer | `r{i}-memo.sealed` | In memory while scanning. The public half is served at `GET /memo-key` |
| Escrow wallet (zcash-devtool DB: UFVK, notes, witnesses) | the proving relayer | `escrow-wallet.sealed` | Unsealed only for one step into `/dev/shm` (RAM) where it exists, else `ESCROW_WALLET_DIR` or `$RUN_DIR/escrow`; sealed again and deleted when the step exits, also on error |
| Relayer Noise key (MPC peering) | that relayer | Production: compose secret from Coolify, mounted under `/run/secrets`, never in git. Local dev: `apps/relayer/config/keys/r{i}.key`, mode 0600, gitignored | While the relayer runs |
| Account tag (the account's credential) | the trader's browser | `localStorage` only | Never outside the browser. Relayer `i` gets only `sᵢ` (memo slot, judge claim, balance query) and fresh XOR shares inside orders and withdrawals |
| Order shares and read tokens | the trader's browser | `localStorage` (with the order) | Share *i* and token *i* go only to relayer *i* |
| Account key shares (`sᵢ` per id) | relayer `i` | its event log (`key` events) | In memory while the relayer runs |
| Judge-mode flags (ids opened by a judge claim) | every relayer that received the claim | its event log (`mock` events) | The claim already shows the id. The flags only make the circuit refuse withdrawals of mock credit, and a refusal looks like any other (#104) |

`scripts/settle-e2e.sh` checks that every file under `$RUN_DIR/frost` is sealed and that no
unsealed escrow wallet is left behind.

**Not sealed:** regtest test wallets (`funder`, `winner-*`, `funder.mnemonic`, `age.txt`,
`deposits.txt`) in `~/.cache/zpredict-run`, deleted every run; the escrow wallet on a host
without tmpfs while one step runs; the escrow wallet while relayer 0 pays out (tmpfs, sealed
again on shutdown); each relayer's event log (`data_dir`): its own order, fill, balance and
key shares, its read tokens, and withdrawal amounts and addresses. Shares reveal nothing
alone; all three logs together reveal everything (the same 3-of-3 assumption as the MPC).
**Same-host DKG:** `settle-payout dkg` runs all three parties in one process, which matches
the single-VM demo. Independent operators would run `part1`–`part3` over the Noise channel.
