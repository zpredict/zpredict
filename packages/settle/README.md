# zpredict-settle

Escrow scanning (#10), batched payouts with verify-then-sign FROST 2-of-3 (#11), and
the signing glue for the zPredict escrow, plus the
findings of the settlement spike (issue #5): **a 2-of-3 FROST escrow received Ironwood funds and spent them in a
mined v6 transaction**, on a Zebra regtest with NU6.3 (Ironwood) and NU7 active.

## Run it

```sh
scripts/settle-e2e.sh                 # build pinned tools, then the whole flow on a fresh chain
SKIP_BUILD=1 scripts/settle-e2e.sh    # reuse built tools
KEEP=1 scripts/settle-e2e.sh          # leave regtest up to poke at
```

Needs Docker, Rust (tested 1.91.1), `uv`, `jq`, `openssl`. About 2 minutes after the
first build. State lives in `~/.cache/zpredict-run` and is wiped at the start of every
run. Relayer secrets are only ever sealed there; see [PRIVACY.md](../../PRIVACY.md).
Nothing secret is checked in.

| Step | Script | What happens |
|---|---|---|
| 0 | `build-tools.sh` | Clone and build zcash-devtool with its own `Cargo.lock`, and this crate's binaries |
| 1 | `regtest-up.sh` | Zebra regtest + lightwalletd; 110 blocks mined to a funder's Orchard-only address, which NU6.3 pays into **Ironwood** (no transparent coinbase, nothing to shield) |
| 2 | `frost-dkg.sh` | `settle-payout dkg`: 2-of-3 RedPallas DKG for `r0 r1 r2` with frost-core as a library; each share and the escrow UFVK are sealed as they are made. One memo key per relayer (sealed). The watch-only escrow wallet is created and then sealed |
| 3 | `fund-escrow.sh` | Funder sends one fixed-denomination note per `DEPOSIT_UNITS` entry (default one 5-unit = 0.05 ZEC note) with an encrypted account tag in the memo, to the Ironwood receiver only; 10 confirmations |
| 4 | `payout-escrow.sh` | One batched payout, signed 2-of-3 (see Batched payouts below) |

Testnet: `NETWORK=test RUN_DIR=~/.cache/zpredict-testnet scripts/frost-dkg.sh` runs the
same DKG against `testnet.zec.rocks:443` and prints a testnet escrow address. Fund it by
hand (see below), then steps 3–4 apply unchanged except that blocks come from the network.

The spike's own flow (frost-client + frostd DKG, one `y`-answered frost-client session per
spend, `frost-pczt` CLI) was replaced by the steps above in #53: it left key shares in
frost-client's clear TOML. Its result is kept below.

## Escrow scanning (#10)

```sh
scripts/scan-e2e.sh    # regtest -> DKG -> one tagged 5-unit deposit -> r0, r1, r2 scan it
MEMO_FROM=sdk scripts/scan-e2e.sh   # same, but the deposit request is built by @zpredict/sdk, as in the web app
```

`testdata/memo-vectors.json` (written by `UPDATE_VECTORS=1 cargo test -p zpredict-settle --test memo_vectors`)
pins the memo format for the TypeScript port in `@zpredict/sdk`.

Each relayer runs a `Scanner` (shared escrow FVK, its relayer index, its memo key) over
lightwalletd: blocks with Ironwood actions are fetched as full transactions (compact
blocks drop memos) and trial-decrypted with the escrow's **external** IVK, so escrow
change is never mistaken for a deposit. Every received note comes out as either

- `Deposit { note: (txid, action), height, units, tag }`: amount exactly 1, 5 or 25
  units (`UNIT_ZATS` = 1,000,000 zats = 0.01 ZEC, the one place the mapping lives), and
  the relayer's memo slot opens; `balance_share(i)` is the initial XOR share in
  half-ticks, `(A·200, 0, 0)` per the #9 decision; or
- `Flagged { note, height, zats, reason }`: any other amount (`Denomination`) or no
  readable tag (`NoTag`). Flagged notes are never credited.

**Deposit memo** (`memo.rs`): ZIP 302 `0xFF` memo, `0xFF | 0x01 | epk (32) | slot₀ | slot₁ | slot₂`,
zero after byte 130. `slotᵢ` = ChaCha20-Poly1305 (zero nonce) of the 16-byte account
tag under `BLAKE2b-256("zPredictMemoKey1", X25519(esk, pkᵢ) ‖ epk ‖ pkᵢ)`, where `pkᵢ` is
relayer `i`'s memo public key and `esk` is fresh per memo. No order data, no amounts.

**Secrets at rest** (`store.rs`): the escrow UFVK and each relayer's memo key are
sealed with ChaCha20-Poly1305 under `ZPREDICT_STORE_KEY` (64 hex chars, environment
only), the label as AAD. The scripts generate one store key per run and never write it.

Regtest run (fresh chain):

```
deposit 6098607d12614873b992cd7d9dbf840ef3b9aec63586421164bb15f7ecc9fef5 0 111 5 38a28f79… 1000   (r0)
deposit 6098607d12614873b992cd7d9dbf840ef3b9aec63586421164bb15f7ecc9fef5 0 111 5 38a28f79… 0      (r1, r2)
```

## Spike result (#5)

Regtest run (every run is a fresh chain, so ids differ per run):

```
txid da2bc12c6ba4847e440ac93b6f9b5f2082d5a3866b399c6c6ed6f1f5ba348ad1
version 6  height 122  ironwood actions 5  transparent in+out 0
```

The coordinator's signature verified against the spend's `rk` in `apply_signature`, the
extractor accepted it, and Zebra 7.0.0 mined it. For a fully shielded tx the sighash is
the byte-reversed txid (ZIP 244), which the logs show.

## Versions

| Piece | Version |
|---|---|
| Zebra | `zfnd/zebra:7.0.0` (digest pinned in `deploy/regtest/compose.yaml`) |
| lightwalletd | `electriccoinco/lightwalletd:v0.6.0` (amd64 only, emulated on arm64) |
| zcash-devtool | `0b3436bb` (librustzcash `eb38d7a`, pczt 0.10.0-pre.2, orchard 0.16.0), feature `regtest_support` |
| this crate | pczt 0.10.0, orchard 0.16.0, zcash_primitives 0.31.0, zcash_protocol 0.11.0, zcash_keys 0.17.0, zcash_client_backend 0.25.0, zcash_client_sqlite 0.23.0; reddsa `ed49e9c` (frost-core 2.2.0) |

## Why this crate exists (the glue)

The planned chain used `zcash-sign` from frost-zcash-demo. **It cannot sign post-NU7
PCZTs**: it is pinned to `zcash_protocol` 0.10.0 / pczt 0.8.0-rc.1, where NU7 is behind
`cfg(zcash_unstable = "nu7")` with placeholder branch ID `0xffffffff`. A PCZT from current
zcash-devtool carries NU7 branch ID `0x77190AD9` on testnet (since 4,465,026) and on our
regtest, so `zcash-sign` fails at `into_effects`. Its `generate` also only encodes for
main/test, not regtest. No upstream PR fixes this yet.

This crate replaces it on the 2026-10-21 librustzcash release:

- `keys` — escrow FVK = FROST group `ak` + throwaway `nk`/`rivk` (same construction as
  `zcash-sign generate`, via `FullViewingKey::from_bytes`); UFVK and an Orchard-only UA
  for main/test/regtest.
- `sign` — shielded sighash via `PrecomputedSighashData` (chooses the v6 rule for v6, so
  the v5-hash-on-v6 `SighashMismatch` trap from frost-zcash-demo #593 cannot happen);
  randomizers from **both** Orchard and Ironwood bundles (the wrong bundle returns no
  spends rather than an error); applies signatures, each verified against `rk`.

## Batched payouts (#11)

```sh
scripts/settle-e2e.sh    # regtest -> DKG (sealed) -> two deposits -> one batched payout -> mined -> nothing left in clear
```

| Step | What happens |
|---|---|
| `settle-payout create` | `payout::create`: payout vector (`<UA> <zats>` per winner; only the UA's Orchard-shaped receiver is paid, anything else is refused) → `zcash_client_backend` proposal over the escrow wallet → **one PCZT**: an Ironwood output per payout, change to the escrow's internal scope, ZIP 317 fee, ZIP 315 expiry, wallet-default padding |
| `devtool pczt prove` | The prover relayer proves in the background while the others sign |
| `settle-payout sign` | `frost::sign_all`: **one FROST session for every spend** (round 1: a commitment per spend; round 2: a signing package + randomizer per spend). Each signer runs `verify_then_sign`, so the coordinator's word is never taken for anything |
| `devtool pczt combine` + `send` | Asserts v6, mined, Ironwood only (zero Orchard, zero transparent), both winners paid |

`verify` (run by every signer on its own copy of the PCZT) refuses unless:
nothing is transparent, Sapling or Orchard; every output (padding included) matches its
`cmx`; every payout is present exactly once and its ciphertext decrypts (recovered with
the escrow OVK); every other non-zero output goes to the escrow's internal scope and
decrypts there; and the fee is exactly ZIP 317 for the action count. It then checks
that each signing request carries its own recomputed sighash and the right spend's
randomizer. The script also signs against a tampered vector (+1 zat) and requires a refusal:

```
settle-payout: refused to sign: action 0: 4000000 zats to an address not in the payout vector
2 signer(s) verified 2 payout(s) and signed 2 spend(s), sighash 00cfd4c7…
txid 8f5c8135addb23796c87f557ccb01dd1a859363b64a6680d48f01644c7d4cf00  version 6  height 123  ironwood actions 3  orchard actions 0  transparent in+out 0
winner-0:     Balance:   0.03000000 REG
winner-1:     Balance:   0.04000000 REG
```

## Spike gaps: status

1. **Embed instead of shelling out**: done, for the DKG and for signing. `frost-core`
   (reddsa RedPallas, the rev frost-zcash-demo uses) is called as a library: no CLI, no
   `y`, no frostd. Between hosts, the DKG round packages and the signing messages still
   need a transport. Today `dkg_local` and `sign_all` run all parties in one process; the
   relayer must carry them over its Noise channel.
2. **Participants check what they sign**: done (`verify_then_sign`, tested with a
   tampered output and a wrong message).
3. **One FROST session for all spends**: done.
4. **Batched multi-output PCZT**: done (`payout::create`).
5. **Viewing key distribution**: done (#53). The UFVK is generated once at the DKG and
   sealed. The prover's zcash-devtool wallet is sealed at rest and unsealed only for one
   step, into tmpfs where there is one. What remains is listed in PRIVACY.md.
6. **Prover placement**: done. One relayer proves in parallel with signing.
7. **Not quantum-recoverable**: documented in DESIGN.md's threat model.
8. **frostd needs TLS**: no longer applies, because frostd is gone.

## Gotchas

- `zcash-sign` + post-NU7: see above. Don't bump it piecemeal; use this crate.
- lightwalletd cannot serve the tree state at height 0, so regtest wallets use
  birthday ≥ 2 (or default to the tip).
- Wallets need a running chain and the chain needs a miner address: derive the funder
  address offline (`wallet derive-address`), mine, then `restore-mnemonic`.
- Mine to the **Orchard-only** receiver; the derived UA also carries Sapling and
  transparent receivers.
- The escrow treats an incoming deposit as untrusted: 10 confirmations before
  `pczt create` will spend it.
- `zcash-devtool inspect` and `generate-address` print to stderr.
- Run steps by hand only with `ZPREDICT_STORE_KEY` exported once; each driver script
  generates one and every step inherits it. The sealed files are useless without it.

## Testnet

Post-NU7 testnet works through the same tools: `testnet.zec.rocks:443` is synced past
NU7 (tip 4,528,399 on 2026-10-22) and the testnet escrow wallet initialises against it.
There is no programmatic faucet: zecfaucet.com sends testnet coins but sits behind
reCAPTCHA; the others we tried do not resolve. Funding is a manual step.
