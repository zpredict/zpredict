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

`dev.sh` generates Noise keys into `config/keys/` on first run (gitignored) and keeps state in `config/data/` (gitignored; delete it to start fresh). The web app needs only `NEXT_PUBLIC_RELAYERS`; the configs already allow `http://localhost:3000` as the CORS origin. Click **Judge mode**, place an order, and its fill share appears after the next batch: one 15 s window plus about 10 s of MPC (N = 16; the first batch also waits for the circuit to compile at startup).

`INSECURE=1 apps/relayer/scripts/dev.sh` uses the plaintext dev matcher instead (see below): batches finish instantly, and **relayer 0 sees every order**.

A single relayer: `zpredict-relayer <config.toml>`. Key pair: `zpredict-relayer keygen <prefix>` writes `<prefix>.key` (mode 0600) and `<prefix>.pub`. For hosted relayers, build with `cargo build --release -p zpredict-relayer`.

## Config

TOML, one file per relayer (`config/r{0,1,2}.toml` are the local examples). Paths are relative to the file. Any top-level scalar can be overridden with `ZPREDICT_<KEY>`, e.g. `ZPREDICT_WEB_ORIGIN=https://app.zpredict.site`, `ZPREDICT_LIGHTWALLETD=https://testnet.zec.rocks:443`, `ZPREDICT_JUDGE=false`. Unknown keys are rejected.

| Key | Meaning |
|---|---|
| `index` | Party index 0, 1 or 2 |
| `network` | `mainnet` / `testnet` / `regtest`; judge mode is refused on mainnet |
| `listen` | HTTP API address |
| `peers` | The three parties' Noise addresses in party order; this relayer listens on `peers[index]` |
| `key_file`, `peer_keys` | Own private key, the three public keys (hex files from `keygen`) |
| `web_origin` | The only origin CORS answers |
| `lightwalletd` | Optional. Tip height and market resolution; the only outside host contacted |
| `batch_size` | Slots per batch, N; must be 16 (`zpredict_circuit::N`) for the real matcher |
| `window_secs` | Batch window; batches start on wall-clock multiples of it |
| `expire_batches` | A pending order missing from the intersection this long becomes `unfilled` |
| `judge`, `judge_credit` | `POST /judge/claim` (mock), credit in half-ticks |
| `data_dir` | Event log directory |
| `insecure_matcher` | Plaintext dev matcher; needs the `dev-insecure` cargo feature as well |
| `[[markets]]` | The `Market` records served by `/markets` |

## How a batch runs (`batch.rs`)

Every window, each relayer:
1. Connects to both peers over **Noise `KK`** (`peers.rs`): X25519 static keys from config, ChaCha20-Poly1305, BLAKE2s. A handshake only completes with the expected peer key, and everything after it (coordination and all MPC traffic) is encrypted and authenticated. Party `i` dials higher parties and accepts lower ones.
2. Swaps its pending orderId set. The batch is the **sorted intersection** of all three, capped at N; the batch number is the max of the three. Orders past N wait for the next batch.
3. Pads to N with all-zero shares. They rebuild to price 0, which the circuit treats as a dummy.
4. Runs the matcher (`mpc.rs`) and stores its own fill share per order, plus any public clearing prices, as one fsynced event.
5. Expires orders that are `expire_batches` old and not in the intersection. These are orders where one of the browser's three POSTs never arrived.

A failed or aborted batch (peer down, MPC abort, timeout) stores nothing, and its orders run again next window. `/health.peers` shows which peers the last attempt reached.

After a batch, **every** batched order is `filled` with a `fillShare`, because a relayer cannot tell a fill from a miss. The owner XORs the three shares and reads the record's `filled` flag (the sdk's `getFill` already does this). `unfilled` means only "expired before batching".

## Matchers

- **`Polytune` (default, real):** `zpredict_circuit::run_party_on` over our Noise links (the relayer implements polytune's `Channel` for them).
- **`InsecureLocalMatcher`:** parties 1 and 2 send their shares to party 0, which clears each market in the clear with `zpredict_core::clear` and hands back fresh fill shares. It is compiled only for tests or with `--features dev-insecure`, and even then used only when the config sets `insecure_matcher = true`. It prints a warning at startup. Never deploy it.

## State (`state.rs`, `store.rs`)

Every change is first appended to `data_dir/events.jsonl` (fsynced) and then applied in memory. At startup the log is replayed through the same code, so a restart keeps every acknowledged share, fill share, balance credit and price. A torn last line from a crash mid-write is dropped. The directory is mode 0700. The log holds only this relayer's own shares.

## Settlement hooks (`settlement.rs`, `state.rs`)

- `State::credit(tag, amount)`: the deposit entry point for the settle scanner. A deposit of A is credited as shares `(A, 0, 0)`. Judge mode uses the same path.
- `State::positions()`: this relayer's fill share of every batched order, the input to the payout MPC.
- `settlement::payout(record, outcome)`: the plaintext payout rule the payout MPC must match.

## Privacy

There are no access logs, no client addresses (the peer address is never read), and no cookies. Logs never contain request bodies. CORS answers only `web_origin`, bodies are capped at 1 KiB, and every response is `no-store`. A second share for the same orderId is refused (409). The relayer never forwards a share: peers exchange only orderIds and MPC messages. The only outbound connections go to the two peers and the configured lightwalletd.

## Known gaps

- **Market id:** the circuit ignores it. Relayers cannot split batches by market, because the market is inside the secret share, so the real matcher can cross orders from different markets in one batch. Fixing this needs the circuit to dummy out slots whose market differs from a batch market (then one batch per open market), or a client-visible market per order (a privacy trade-off). The insecure matcher clears per market.
- **Clearing price:** the circuit has no public price output, so `lastPrice`/`history` fill up only under the insecure matcher. The relayer side already stores and serves `(market, price)` pairs.
- **Balances (#41):** the circuit checks no collateral and outputs no updated balances. Balance shares change only through `credit`, and it adds to relayer 0's share in the clear, which stays valid only until MPC re-randomises balances.
- **Outcome signatures:** markets resolve from lightwalletd, but `outcomeSig` waits for the FROST signer.
- **Crash between MPC and fsync:** a relayer that crashes in that gap re-pends orders its peers recorded as filled. They then expire on that relayer, and the sdk reports a disagreement for those orders.
