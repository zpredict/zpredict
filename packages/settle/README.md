# zpredict-settle

FROST 2-of-3 signing glue for the zPredict escrow, plus the findings of the settlement
spike (issue #5): **a 2-of-3 FROST escrow received Ironwood funds and spent them in a
mined v6 transaction**, on a Zebra regtest with NU6.3 (Ironwood) and NU7 active.

## Run it

```sh
scripts/frost-e2e.sh                 # build pinned tools, then the whole flow on a fresh chain
SKIP_BUILD=1 scripts/frost-e2e.sh    # reuse built tools
KEEP=1 scripts/frost-e2e.sh          # leave regtest + frostd up to poke at
```

Needs Docker, Rust (tested 1.91.1), `uv`, `jq`, `openssl`, `xxd`. About 2 minutes after
the first build. All state (seeds, FROST key shares, PCZTs, logs) lives in
`~/.cache/zpredict-run` and is wiped at the start of every run. Nothing secret is checked in.

| Step | Script | What happens |
|---|---|---|
| 0 | `build-tools.sh` | Clone and build the pinned tools with their own `Cargo.lock` |
| 1 | `regtest-up.sh` | Zebra regtest + lightwalletd; 110 blocks mined to a funder's Orchard-only address, which NU6.3 pays into **Ironwood** (no transparent coinbase, nothing to shield) |
| 2 | `frost-dkg.sh` | frostd (local TLS) + 2-of-3 RedPallas DKG between `r0 r1 r2`; `frost-pczt ufvk` turns the group key into the escrow UFVK/address; watch-only escrow wallet |
| 3 | `fund-escrow.sh` | Funder sends 5 ZEC to the escrow (Ironwood receiver only), 11 confirmations |
| 4 | `frost-spend.sh` | `pczt create` + `prove` → `frost-pczt sighash` → coordinator + `r0`,`r1` sign (`r2` offline) → `frost-pczt apply` → `pczt combine` + `send`; asserts v6, mined, Ironwood actions > 0, zero transparent in/out |

Testnet: `NETWORK=test RUN_DIR=~/.cache/zpredict-testnet scripts/frost-dkg.sh` runs the
same DKG against `testnet.zec.rocks:443` and prints a testnet escrow address. Fund it by
hand (see below), then steps 3–4 apply unchanged except that blocks come from the network.

## Result

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
| frostd, frost-client | frost-zcash-demo `53df99c2` (frost-core 2.2.0, frost-rerandomized 2.1.0, reddsa git `ed49e9c`) |
| frost-pczt (this crate) | pczt 0.10.0, orchard 0.16.0, zcash_primitives 0.31.0, zcash_protocol 0.11.0, zcash_keys 0.17.0 |

## Why this crate exists (the glue)

The planned chain used `zcash-sign` from frost-zcash-demo. **It cannot sign post-NU7
PCZTs**: it is pinned to `zcash_protocol` 0.10.0 / pczt 0.8.0-rc.1, where NU7 is behind
`cfg(zcash_unstable = "nu7")` with placeholder branch ID `0xffffffff`. A PCZT from current
zcash-devtool carries NU7 branch ID `0x77190AD9` on testnet (since 4,465,026) and on our
regtest, so `zcash-sign` fails at `into_effects`. Its `generate` also only encodes for
main/test, not regtest. No upstream PR fixes this yet.

`frost-pczt` (about 370 lines with docs and tests) replaces it on the 2026-10-21 librustzcash release:

- `keys` — escrow FVK = FROST group `ak` + throwaway `nk`/`rivk` (same construction as
  `zcash-sign generate`, via `FullViewingKey::from_bytes`); UFVK and an Orchard-only UA
  for main/test/regtest.
- `sign` — shielded sighash via `PrecomputedSighashData` (chooses the v6 rule for v6, so
  the v5-hash-on-v6 `SighashMismatch` trap from frost-zcash-demo #593 cannot happen);
  randomizers from **both** Orchard and Ironwood bundles (the wrong bundle returns no
  spends rather than an error); applies signatures, each verified against `rk`.

## Gaps for #10 (settlement batcher) and #11 (relayer signer)

1. **Embed instead of shelling out.** frost-client's coordinator/participant are now
   library-shaped (`frost-client` 53df99c); call them from the relayer instead of CLI +
   stdin `y`. frostd stays the transport (or replace it with relayer-to-relayer TLS).
2. **Participants must check what they sign.** Today a participant sees a raw sighash and
   answers `y`. Each relayer must receive the PCZT, recompute `sighash` itself, check the
   outputs against the MPC payout vector, and only then sign. Nothing does this yet.
3. **One FROST session per spend.** A batch with k escrow notes needs k signatures over
   the same sighash with k randomizers; frost-client accepts several `-m/-r` pairs in one
   session — use that.
4. **Batched multi-output PCZT.** `pczt create` pays one address. The batcher needs many
   outputs (one per winner, fresh diversified addresses) + change to escrow + padding:
   build with `zcash_client_backend` proposals / pczt `Creator` directly (devtool's
   `create_manual`/`pay` are references). ZIP 317 fee and ZIP 315 expiry come for free.
5. **Viewing key distribution.** Every relayer needs the same UFVK (`nk`/`rivk` are random
   at generation). Generate once in the DKG ceremony and hand it out with the key shares;
   store both encrypted (frost-client keeps shares in clear TOML).
6. **Prover placement.** Any one relayer can create + prove; the others only verify +
   sign. Proving (Halo 2) is the slow step; keep it off the signing path.
7. **Not quantum-recoverable.** The escrow FVK uses the non-ZIP-2005 derivation (as
   `zcash-sign` does). Fine for the hackathon; note it in the threat model.
8. **frostd needs TLS**; locally we mint a throwaway CA and pass it via `SSL_CERT_FILE`.
   Production relayers (`r0/r1/r2.zpredict.site`) need real certificates.

## Gotchas

- `zcash-sign` + post-NU7: see above. Don't bump it piecemeal; use `frost-pczt`.
- lightwalletd cannot serve the tree state at height 0, so regtest wallets use
  birthday ≥ 2 (or default to the tip).
- Wallets need a running chain and the chain needs a miner address: derive the funder
  address offline (`wallet derive-address`), mine, then `restore-mnemonic`.
- Mine to the **Orchard-only** receiver; the derived UA also carries Sapling and
  transparent receivers.
- The escrow treats an incoming deposit as untrusted: 10 confirmations before
  `pczt create` will spend it.
- `zcash-devtool inspect` and `generate-address` print to stderr.
- `frost-client` reads `-m`/`-r` files as raw bytes; hex goes through `xxd -r -p`.
- A stale frostd from an earlier run keeps port 2744 with the old certificate, so the
  next DKG fails with `InvalidCertificate(BadSignature)`; the scripts track and kill it
  by pid.

## Testnet

Post-NU7 testnet works through the same tools: `testnet.zec.rocks:443` is synced past
NU7 (tip 4,528,399 on 2026-10-22) and the testnet escrow wallet initialises against it.
There is no programmatic faucet: zecfaucet.com sends testnet coins but sits behind
reCAPTCHA; the others we tried do not resolve. Funding is a manual step.
