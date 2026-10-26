# zpredict-faucet

The testnet faucet at https://faucet.zpredict.site. A drip sends one fixed 1-unit (0.01 TAZ) shielded deposit to the escrow, carrying a deposit memo the browser built for its own account, so the relayers credit it like any other deposit. The faucet never sees the account tag.

```sh
cargo run -p zpredict-faucet   # configured by FAUCET_* env vars (see src/main.rs)
```

| Route | |
|---|---|
| `GET /status` | Whether a drop is available now, the wait and how many are left today; with `?tx=`, whether that drip is mined |
| `POST /challenge` | A proof-of-work challenge |
| `POST /drip` | Memo + proof of work + Turnstile token → txid |

- Anti-abuse without per-IP state: Cloudflare Turnstile (`TURNSTILE_SECRET_KEY`), hashcash proof of work, one drop per interval and a daily cap.
- No request logs; it never reads the caller's address.
- Pays from its own shielded wallet through `zcash-devtool`. Deploy: `deploy/production/faucet.compose.yaml`.
