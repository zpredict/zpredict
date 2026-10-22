# Privacy

What zPredict keeps, where, and who can read it. The leak checklist is in
[DESIGN.md](DESIGN.md#leak-checklist-from-the-research).

## Secrets on disk

Relayer secrets are sealed with ChaCha20-Poly1305 (`packages/settle` `store.rs`) under a
32-byte store key, `ZPREDICT_STORE_KEY`. The store key only ever exists in the
environment: the scripts generate a fresh one per run, and production injects it as a
secret. Each sealed file binds its label (`frost-key-share`, `ufvk`, `memo-key`,
`escrow-wallet`) as associated data, so one sealed secret can't be passed off as another.

| Secret | Who holds it | At rest | In clear, when |
|---|---|---|---|
| FROST key share (one per relayer) | that relayer | `r{i}-share.sealed` | Only in memory: during the DKG (`settle-payout dkg` seals each share before writing anything) and while signing. No frost-client config file is involved |
| Escrow UFVK (shared viewing key) | every relayer | `escrow-ufvk.sealed` | In memory while scanning, verifying or building a payout. Also as a command-line argument for the one `zcash-devtool wallet init-fvk` call that creates the escrow wallet |
| Deposit-memo key (X25519, one per relayer) | that relayer | `r{i}-memo.sealed` | In memory while scanning. The public half is served at `GET /memo-key` |
| Escrow wallet (zcash-devtool / zcash_client_sqlite DB: UFVK, notes, witnesses) | the proving relayer | `escrow-wallet.sealed` | Unsealed only for one step (sync, build a payout, prove, send) into `/dev/shm` where it exists (tmpfs, RAM). Without `/dev/shm`, e.g. on macOS, it goes to `ESCROW_WALLET_DIR` or `$RUN_DIR/escrow`. It is sealed again and deleted when the step exits, including on error |
| Relayer Noise key (MPC peering) | that relayer | Production: never on disk (env → tmpfs `/run/zpredict`). Local dev: `apps/relayer/config/keys/r{i}.key`, mode 0600, gitignored | While the relayer runs |
| Account tag | the trader's browser | `localStorage` only | Only to the relayers. The deposit memo encrypts it to each one, and the balance query (`GET /accounts/:tag`) sends it to each over TLS. It's never on chain in clear |

`scripts/settle-e2e.sh` checks that every file under `$RUN_DIR/frost` is sealed and that no
unsealed escrow wallet is left behind.

## What is still not sealed

- **Test depositors and winners on regtest** (`funder`, `winner-*` wallets, `funder.mnemonic`,
  `age.txt`): they stand in for users' own wallets, not relayer material. They live in
  `~/.cache/zpredict-run` and are deleted at the start of every run.
- **The escrow wallet on a host without tmpfs** is plaintext on disk while one step runs. Use
  `ESCROW_WALLET_DIR` on a RAM disk, or run the prover on Linux.
- **The relayer event log** (`data_dir`): order shares, fill shares and balance shares this
  relayer already holds. These are XOR shares, so they reveal nothing alone, but anyone
  holding all three relayers' logs can rebuild everything. That's the same 3-of-3 assumption
  as the MPC itself.
- **Same-host DKG**: `settle-payout dkg` runs all three parties in one process, so for that
  moment one process sees every share. That matches the hosted demo, where all three relayers
  share one VM (see `deploy/production/compose.yaml`). Independent operators would each run
  `part1`/`part2`/`part3` and exchange the round packages over the relayers' Noise channel.
