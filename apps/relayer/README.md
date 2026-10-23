# zpredict-relayer

One of the three zPredict relayers. It takes **one XOR share per order** from the browser, agrees on each batch with its two peers, runs the clearing circuit (`zpredict-circuit`, 3-party polytune MPC) as one party, and serves its own fill and balance shares back. It never holds two shares of anything and never sees an order, fill or balance in the clear.

## Run 3 relayers + the web app locally

```sh
pnpm install
export CARGO_TARGET_DIR=$HOME/.cache/zpredict-target   # optional, shared build cache
apps/relayer/scripts/dev.sh               # relayers on :4101-4103, peers on :4201-4203, real MPC
# second terminal: the web app pointed at them
NEXT_PUBLIC_RELAYERS=http://localhost:4101,http://localhost:4102,http://localhost:4103 \
  pnpm --filter @zpredict/web dev         # http://localhost:3000
```

`dev.sh` generates Noise keys into `config/keys/` on first run (gitignored) and keeps state in `config/data/` (gitignored; delete it to start fresh). The web app needs only `NEXT_PUBLIC_RELAYERS`; the configs already allow `http://localhost:3000` as the CORS origin. Click **Judge mode**, place an order, and its fill share appears about half a 4 s window plus 0.5 s of MPC later once the relayers hold a preprocessed run (8 order slots, 32 table rows, all open markets in one run; startup compiles the circuit, ~6 s, then preprocesses the first run, ~6 s).

`INSECURE=1 apps/relayer/scripts/dev.sh` uses the plaintext dev matcher instead (see below): batches finish instantly, and **relayer 0 sees every order**.

A single relayer: `zpredict-relayer <config.toml>`. Key pair: `zpredict-relayer keygen <prefix>` writes `<prefix>.key` (mode 0600) and `<prefix>.pub`. For hosted relayers, build with `cargo build --release -p zpredict-relayer`.

## Config

TOML, one file per relayer (`config/r{0,1,2}.toml` are the local examples). Paths are relative to the file. Any top-level scalar can be overridden with `ZPREDICT_<KEY>`, e.g. `ZPREDICT_WEB_ORIGIN=https://app.zpredict.site`, `ZPREDICT_ORACLE_LIGHTWALLETD=""` (offline), `ZPREDICT_JUDGE=false`. Unknown keys are rejected.

| Key | Meaning |
|---|---|
| `index` | Party index 0, 1 or 2 |
| `network` | `mainnet` / `testnet` / `regtest`; judge mode is refused on mainnet |
| `listen` | HTTP API bind address and port (production: `0.0.0.0:8080` in the container, published on loopback 3172–3174 for host nginx, see `deploy/production/`) |
| `peers` | The three parties' Noise addresses in party order; this relayer listens on `peers[index]` |
| `key_file`, `peer_keys` | Own private key, the three public keys (hex files from `keygen`) |
| `web_origin` | The only origin CORS answers |
| `oracle_lightwalletd` | The chain the markets are about (default `https://zec.rocks:443`, mainnet): tip height in `/health` and market progress, and the oracle resolvers. `""` = offline |
| `escrow_lightwalletd` | The chain the escrow lives on (default `https://testnet.zec.rocks:443`): deposit scanning and payouts (settle). Never used for market data |
| `batch_size` | Order slots per batch, N, shared by all open markets (2..=21). Crossing costs ~N² gates: at 32 rows, 8 ≈ 5 s and 16 ≈ 13.5 s per window on an M4 Pro |
| `table_rows` | Balance-table rows per batch (default 32): the most funded accounts this deployment holds. ~8k AND gates per row |
| `window_secs` | Batch window; batches start on wall-clock multiples of it. With a preprocessed run held it only needs to cover the online part (~0.5 s on an M4 Pro), so a few seconds |
| `expire_batches` | A pending order missing from the intersection this long becomes `unfilled` |
| `judge`, `judge_credit` | `POST /judge/claim` (mock), credit in half-ticks |
| `memo_key_file` | Optional. Hex file holding this relayer's deposit-memo public key: the `pubkey` printed by `settle memo-key`, whose sealed secret stays with the escrow scanner. It is served at `GET /memo-key`, and without it that route answers 404. `ZPREDICT_STORE_KEY` (the settle store key) is never read as config |
| `frost_share_file` | Optional. Sealed FROST key share (`settle-payout dkg` → `rN-share.sealed`), opened with `ZPREDICT_STORE_KEY`. With it, outcomes all three relayers agree on are FROST-signed 2-of-3 (`outcome.rs`) and `GET /group-key` serves the group key; without it outcomes stay unsigned and that route answers 404 |
| `data_dir` | Event log directory, plus `markets.json` (rolling markets and signed outcomes, kept across restarts) |
| `insecure_matcher` | Plaintext dev matcher; needs the `dev-insecure` cargo feature as well |
| `[rolling]` | Optional hourly markets (`markets/rolling.rs`): `plugin` (`shielded-actions`), `interval_secs`, `horizon_secs`, `close_secs`, `sample_blocks` (median for N), `keep_resolved`, `fast_from` (NU7: 25 s blocks from here). See DESIGN.md "Resolution" |
| `[[markets]]` | The `Market` records served by `/markets` (ids below 1,000,000; rolling markets use the rest) |
| `[settlement]` | Optional; off = deposits only from judge mode, nothing paid out. `network` (`main`/`test`/`regtest`), the three sealed files from the key ceremony (`ufvk`, `memo_key`, `key_share`, opened with `ZPREDICT_STORE_KEY`), `start_height` (first escrow block to scan), `confirmations` (default 10). Relayer 0, the prover, also needs `devtool` (zcash-devtool binary), `wallet_dir` (the unsealed escrow wallet, ideally tmpfs) and `devtool_server` (its `-s` lightwalletd) |

## How a batch runs (`batch/`)

Every window, each relayer:
1. Connects to both peers over **Noise `KK`** (`peers.rs`): X25519 static keys from config, ChaCha20-Poly1305, BLAKE2s. A handshake only completes with the expected peer key, and everything after it (coordination and all MPC traffic) is encrypted and authenticated. Party `i` dials higher parties and accepts lower ones.
2. Swaps a hello (`batch/hello.rs`): its pending orderIds, the confirmed deposits its own escrow scan found, the withdrawal requests it holds, the markets its own node resolved, and from relayer 0 the balance-table row ids, the open market ids and judge credits. Only what **all three** offer counts: the batch is the sorted intersection of the pending sets, capped at N; the batch number is the max of the three. Orders past N wait for the next batch.
3. Relayers 1 and 2 append zero-share rows for any table rows relayer 0 added (see Balances).
4. If a market resolved alike on all three nodes and is unpaid, runs the resolution program instead of clearing (`batch/resolution.rs`): every position, 16 at a time, pays its winners into the table. Recorded once per market.
5. Otherwise pads orders to N, the table to `table_rows` rows and the withdrawal slots to 2 with all-zero shares, and sets the credits: agreed deposits for accounts in the batch's rows, plus relayer 0's judge credits where this relayer runs judge mode (otherwise it refuses the batch). A zero order rebuilds to price 0, which the circuit treats as a dummy; a zero row has balance 0.
6. Runs the matcher (`mpc/`) once per group of up to 4 open markets (`zpredict_circuit::DEFAULT_MARKETS`), padded with unused slots: one run for the demo's three markets. With more markets, fill shares XOR together and balances chain from run to run. Which markets have orders never changes what runs.
7. Stores its fill share per order, its new balance share per row, public prices, the deposits credited and each withdrawal slot's result as one fsynced event, and expires orders that are `expire_batches` old and not in the intersection. These are orders where one of the browser's three POSTs never arrived.
8. With `[settlement]` on, pays debited withdrawals (`escrow/payout.rs`): relayer 0 syncs the escrow wallet, builds one PCZT for all of them and proves it in the background; relayers 0 and 1 each run verify-then-sign against their own ledger's payout vector, exchanging FROST round messages over the Noise links; relayer 0 aggregates, combines and broadcasts, recording `paying` first so a crash can never pay twice, then sends both peers the txid.
9. If it holds no preprocessed clearing run, preprocesses the next one with its peers (`batch/mod.rs`, #94): ~92% of a run, input-independent. The next window with work runs only the online part. The hello carries each relayer's held run id; a run is used only if all three hold the same one, otherwise each drops its own and the batch preprocesses inline.

A failed or aborted batch (peer down, MPC abort, timeout) changes no shares, and its orders run again next window. `/health.peers` shows which peers the last attempt reached.

After a batch, **every** batched order is `filled` with a `fillShare`, because a relayer cannot tell a fill from a miss. The owner XORs the three shares and reads the record's `filled` flag (the sdk's `getFill` already does this). `unfilled` means only "expired before batching".

## Balances (`table.rs`)

The circuit (#46) checks collateral against a **balance table** of `table_rows` rows (`id u64 | balance u64`, XOR-shared). The **whole table goes into every batch**, so no relayer learns who traded. Each row also has a 128-bit **key** (the account's credential), which each relayer holds only as its own share, and each order spends from the first row whose key equals the order's `key`. The row id is a public label and grants nothing. An order with no row, or one that can't cover its worst case, becomes a dummy.

- **Rows and order:** relayer 0 owns the row order. Its share of a new row is the plain id and amount: `(row, 0, 0)`. Relayers 1 and 2 learn new row ids from relayer 0's hello and append all-zero shares. Rows are only ever appended, and a table that is not a prefix of relayer 0's fails the batch.
- **Credits:** scanned deposits enter the circuit as public per-row credits once all three relayers scanned them; relayer 0 opens a zero row for a new depositor's account. A judge claim (`State::claim`, new ids only) credits a fresh row's `(row, 0, 0)` share at relayer 0. Top-ups to a row that has been through MPC become a pending public credit (#57).
- **Keys (`table.rs`):** each relayer records its key share per account id from its own deposit-memo slot or a judge claim. Honest shares are deterministic per account, so a second, different share for a known id means another relayer tried to choose this relayer's share; the key is then burned here (a fresh random share every batch), which loses the row instead of handing it over. Rows without a usable share get fresh randomness the same way.
- **Reads:** `GET /accounts/{id}?key={share}` serves the balance share of account `id` (hex16, u64 LE) only to a caller holding this relayer's key share for it, so a relayer cannot collect the other two shares of someone's balance. It also serves the account's `seat`: `seated` (in the first `table_rows` rows), `waiting` (past them, so its orders can't fill yet) or `none`.
- **Capacity (#99):** a judge claim when the table already has `table_rows` rows answers `503 table full`; a repeated claim for the same id and key share is `200` with no second credit, so a browser can retry a half-failed claim. Relayer 0 logs `table: N of M rows used at startup` and then `table: N of M rows used, W accounts waiting` whenever it changes (stderr only; nothing public serves the count).
- **Sealing:** relayer 0 marks the rows it puts into a batch as sealed before the run, so a credit that arrives mid-batch goes to a new row instead of being overwritten by the batch output.

## Matchers

- **`Polytune` (default, real):** `zpredict_circuit::run_party_on` (clearing) and `run_resolution_on` (payouts) over our Noise links (the relayer implements polytune's `Channel` for them).
- **`InsecureLocalMatcher`:** parties 1 and 2 send their shares to party 0. Party 0 rebuilds everything, runs `zpredict_core::{apply_flows, clear_with_balances, resolve}`, and hands back fresh shares and the public outputs. It mirrors the circuits. It is compiled only for tests or with `--features dev-insecure`, and even then used only when the config sets `insecure_matcher = true`. It prints a warning at startup. Never deploy it.

`Polytune` clears up to four markets per circuit run (orders only cross within their market), passing that window's public credits in the first run, and takes `Cleared::prices` (one per market) from the circuit's public output.

## State (`state.rs`, `store.rs`)

Every change is first appended to `data_dir/events.jsonl` (fsynced) and then applied in memory (`state/apply.rs`). Events are: order shares, credits, key shares, adopted rows, seals, batch results (fill shares, balance shares, prices, expiries, credited deposits, withdrawal results), scanned deposits and scan progress, withdrawal requests, resolved markets and payout status. At startup the log is replayed through the same code, so a restart keeps every acknowledged share. A torn last line from a crash mid-write is dropped. The directory is mode 0700. The log holds only this relayer's own shares.

## Settlement (`escrow/`, `ledger.rs`)

- **Deposits:** `escrow/scan.rs` reads the escrow chain (`escrow_lightwalletd`) every 20 s with the shared viewing key and this relayer's memo key, and records each confirmed fixed-denomination deposit with a readable memo slot (account id and this relayer's key share). They are credited through the circuit once all three relayers recorded them.
- **Positions:** `State::positions()`, every batched order's share with its fill share, is the input to the resolution program.
- **Withdrawals:** `POST /withdrawals {withdrawalId, share, amount, address}` (all three get the same request, each with its own fresh XOR share of the account key, hex32) and `GET /withdrawals/{id}` → `pending | refused | debited | paying | paid` (+ txid; `payout: "retrying"` on a debited request after a failed payout round). Judge-mode accounts are flagged as mock at claim time (`Event::Mock`), and the circuit refuses their withdrawals (`refused`), so mock credit never leaves the escrow (#104). A failed payout round is logged and retried with backoff (relayer 0 announces it in the hello); it never stops clearing or preprocessing. Each keeps 2 half-ticks (10,000 zats) toward the ZIP 317 fee; the escrow pays the rest of the fee.
- **End to end:** `scripts/relayer-e2e.sh` runs deposit → trade → resolution → withdrawal on regtest through three real relayers.

## Privacy

There are no access logs, no client addresses (the peer address is never read), and no cookies. Logs never contain request bodies. CORS answers only `web_origin`, bodies are capped at 1 KiB, and every response is `no-store`. A second share for the same orderId is refused (409). The relayer never forwards a share: peers exchange orderIds, table row ids (8-byte public account labels, which every relayer already sees with each deposit) and MPC messages. Key shares never leave the relayer that holds them except as MPC input. The only outbound connections go to the two peers and the two configured lightwalletd endpoints (oracle and escrow).

## Known gaps

- **Table size (#48):** a batch carries only the first `table_rows` rows. Orders from accounts in later rows become dummies; rows are never reclaimed yet (#64, see DESIGN.md).
- **Pending top-ups:** a credit to an account whose row has already been batched waits for the next window's MPC (one runs even without orders), so `/accounts` shows it a window late.
- **Burned keys:** a relayer that registers a different key share for someone's id at another relayer cannot spend the account, but it does lock it (denial of service, like aborting MPC).
- **A crashed payout stays `paying`:** if relayer 0 dies between recording `paying` and the broadcast, nothing retries; an operator checks the chain first.
- **Positions are never pruned:** every resolution runs over all positions so far (16 per MPC run, ~3 s each on an M4 Pro).
- **Outcome signatures:** markets resolve from the oracle lightwalletd, but `outcomeSig` waits for the FROST signer.
- **Crash between MPC and fsync:** a relayer that crashes in that gap re-pends orders its peers recorded as filled, and its balance shares go stale. They then expire on that relayer, and the sdk reports a disagreement for those orders.
