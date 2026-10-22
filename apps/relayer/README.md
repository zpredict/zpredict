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

`dev.sh` generates Noise keys into `config/keys/` on first run (gitignored) and keeps state in `config/data/` (gitignored; delete it to start fresh). The web app needs only `NEXT_PUBLIC_RELAYERS`; the configs already allow `http://localhost:3000` as the CORS origin. Click **Judge mode**, place an order, and its fill share appears after the next batch: at most one 12 s window plus about 5 s of MPC (8 order slots, 32 table rows, all open markets in one run; startup compiles the circuit first, ~6 s).

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
| `window_secs` | Batch window; batches start on wall-clock multiples of it |
| `expire_batches` | A pending order missing from the intersection this long becomes `unfilled` |
| `judge`, `judge_credit` | `POST /judge/claim` (mock), credit in half-ticks |
| `memo_key_file` | Optional. Hex file holding this relayer's deposit-memo public key: the `pubkey` printed by `settle memo-key`, whose sealed secret stays with the escrow scanner. It is served at `GET /memo-key`, and without it that route answers 404. `ZPREDICT_STORE_KEY` (the settle store key) is never read as config |
| `frost_share_file` | Optional. Sealed FROST key share (`settle-payout dkg` → `rN-share.sealed`), opened with `ZPREDICT_STORE_KEY`. With it, outcomes all three relayers agree on are FROST-signed 2-of-3 (`outcome.rs`) and `GET /group-key` serves the group key; without it outcomes stay unsigned and that route answers 404 |
| `data_dir` | Event log directory, plus `markets.json` (rolling markets and signed outcomes, kept across restarts) |
| `insecure_matcher` | Plaintext dev matcher; needs the `dev-insecure` cargo feature as well |
| `[rolling]` | Optional hourly markets (`markets/rolling.rs`): `plugin` (`shielded-actions`), `interval_secs`, `horizon_secs`, `close_secs`, `sample_blocks` (median for N), `keep_resolved`, `fast_from` (NU7: 25 s blocks from here). See DESIGN.md "Resolution" |
| `[[markets]]` | The `Market` records served by `/markets` (ids below 1,000,000; rolling markets use the rest) |

## How a batch runs (`batch.rs`)

Every window, each relayer:
1. Connects to both peers over **Noise `KK`** (`peers.rs`): X25519 static keys from config, ChaCha20-Poly1305, BLAKE2s. A handshake only completes with the expected peer key, and everything after it (coordination and all MPC traffic) is encrypted and authenticated. Party `i` dials higher parties and accepts lower ones.
2. Swaps a hello: its pending orderIds, and from relayer 0 the balance-table row ids and the open market ids. The batch is the **sorted intersection** of the three pending sets, capped at N; the batch number is the max of the three. Orders past N wait for the next batch.
3. Relayers 1 and 2 append zero-share rows for any table rows relayer 0 added (see Balances).
4. Pads orders to N and the table to `table_rows` rows with all-zero shares. A zero order rebuilds to price 0, which the circuit treats as a dummy; a zero row has balance 0.
5. Runs the matcher (`mpc/`) once per group of up to 4 open markets (`zpredict_circuit::DEFAULT_MARKETS`), padded with unused slots: one run for the demo's three markets. With more markets, fill shares XOR together and balances chain from run to run. Which markets have orders never changes what runs.
6. Stores its fill share per order, its new balance share per row and any public prices as one fsynced event, and expires orders that are `expire_batches` old and not in the intersection. These are orders where one of the browser's three POSTs never arrived.

A failed or aborted batch (peer down, MPC abort, timeout) changes no shares, and its orders run again next window. `/health.peers` shows which peers the last attempt reached.

After a batch, **every** batched order is `filled` with a `fillShare`, because a relayer cannot tell a fill from a miss. The owner XORs the three shares and reads the record's `filled` flag (the sdk's `getFill` already does this). `unfilled` means only "expired before batching".

## Balances (`table.rs`)

The circuit (#46) checks collateral against a **balance table** of 16 rows (`id u64 | balance u64`, XOR-shared). The **whole table goes into every batch**, so no relayer learns who traded. Each order spends from the first row whose id matches its `account`. An order with no row, or one that can't cover its worst case, becomes a dummy.

- **Rows and order:** relayer 0 owns the row order. Its share of a new row is the plain id and amount: `(row, 0, 0)`. Relayers 1 and 2 learn new row ids from relayer 0's hello and append all-zero shares. Rows are only ever appended, and a table that is not a prefix of relayer 0's fails the batch.
- **Credits:** `State::credit(tag, amount)` is the entry point for deposits and judge claims. On relayer 0 it adds to the account's row while that row is fresh (not yet in a batch, so its shares are still `(row, 0, 0)`). Otherwise it adds a new row with the same id, because once MPC has re-randomised a row, adding to one XOR share would not add to the balance. On relayers 1 and 2 it is a no-op; they get the row at the next batch.
- **Reads:** `/accounts/:tag` serves the balance share of the tag's first row (`tag` → id = first 8 bytes, little-endian, as in `Order::account`).
- **Sealing:** relayer 0 marks the rows it puts into a batch as sealed before the run, so a credit that arrives mid-batch goes to a new row instead of being overwritten by the batch output.

## Matchers

- **`Polytune` (default, real):** `zpredict_circuit::run_party_on(links, party, orders, accounts)` over our Noise links (the relayer implements polytune's `Channel` for them). It returns fill shares and new balance shares.
- **`InsecureLocalMatcher`:** parties 1 and 2 send their shares to party 0. Party 0 rebuilds the orders and the table, clears one market at a time with `zpredict_core::clear_with_balances`, and hands back fresh shares and the price. It mirrors the circuit. It is compiled only for tests or with `--features dev-insecure`, and even then used only when the config sets `insecure_matcher = true`. It prints a warning at startup. Never deploy it.

`Polytune` clears up to four markets per circuit run (orders only cross within their market), passing that window's public credits in the first run, and takes `Cleared::prices` (one per market) from the circuit's public output.

## State (`state.rs`, `store.rs`)

Every change is first appended to `data_dir/events.jsonl` (fsynced) and then applied in memory. Events are: order shares, credits, adopted rows, seals, and batch results (fill shares, balance shares, prices, expiries). At startup the log is replayed through the same code, so a restart keeps every acknowledged share. A torn last line from a crash mid-write is dropped. The directory is mode 0700. The log holds only this relayer's own shares.

## Settlement hooks (`settlement.rs`, `state.rs`)

- `State::credit(tag, amount)`: the deposit entry point for the settle scanner (see Balances). Judge mode uses the same path.
- `State::positions()`: this relayer's fill share of every batched order, the input to the payout MPC.
- `settlement::payout(record, outcome)`: the plaintext payout rule the payout MPC must match.

## Privacy

There are no access logs, no client addresses (the peer address is never read), and no cookies. Logs never contain request bodies. CORS answers only `web_origin`, bodies are capped at 1 KiB, and every response is `no-store`. A second share for the same orderId is refused (409). The relayer never forwards a share: peers exchange orderIds, table row ids (8-byte account ids, which every relayer already sees with each deposit) and MPC messages. The only outbound connections go to the two peers and the two configured lightwalletd endpoints (oracle and escrow).

## Known gaps

- **Table size (#48):** a batch carries only the first `table_rows` rows. Orders from accounts in later rows become dummies; rows are never reclaimed yet (that needs the withdrawal path, see DESIGN.md).
- **Pending top-ups:** a credit to an account whose row has already been batched waits for the next window's MPC (one runs even without orders), so `/accounts` shows it a window late.
- **Credits trust relayer 0:** relayers 1 and 2 take relayer 0's announced credits as given. They should check them against their own escrow scan once the settle scanner feeds deposits.
- **Outcome signatures:** markets resolve from the oracle lightwalletd, but `outcomeSig` waits for the FROST signer.
- **Crash between MPC and fsync:** a relayer that crashes in that gap re-pends orders its peers recorded as filled, and its balance shares go stale. They then expire on that relayer, and the sdk reports a disagreement for those orders.
