# zPredict

[![CI](https://github.com/zpredict/zpredict/actions/workflows/deploy.yml/badge.svg?branch=main)](https://github.com/zpredict/zpredict/actions/workflows/deploy.yml) [![Nightly](https://github.com/zpredict/zpredict/actions/workflows/nightly.yml/badge.svg?branch=main)](https://github.com/zpredict/zpredict/actions/workflows/nightly.yml)

Shielded prediction market on Zcash. Price public, participants private: nobody learns that you bet, which side, or how much.

**[Try it](https://app.zpredict.site)** (Judge mode) · [Docs](https://docs.zpredict.site) · [Pitch video](https://zpredict.site/pitch/) · [Site](https://zpredict.site) · [Design](DESIGN.md) · [Privacy audit](PRIVACY.md)

## How it works

1. Your browser splits each order into three XOR shares and sends one to each relayer.
2. The relayers cross YES/NO at the midpoint inside 3-party MPC (polytune), checking balances and your account credential in-circuit. Only fills and a public clearing price come out.
3. Collateral sits in a FROST 2-of-3 Ironwood escrow; withdrawals are batched and every signer re-derives the sighash before signing.
4. Markets resolve from Zcash mainnet block data; outcomes are FROST-signed and verified in the browser.

Reading orders needs all three relayers; moving funds needs two. Demo limits (one VM, Cloudflare, judge-mode credits) are in [PRIVACY.md](PRIVACY.md).

## Repository

| Path | What |
|---|---|
| `apps/relayer` | Relayer: HTTP API, Noise peer links, MPC party, deposits, payouts |
| `apps/web`, `apps/landing`, `apps/docs` | Next.js app, Astro site, docs (Fumadocs) |
| `packages/core`, `circuit` | Order/balance encodings and the clearing rule; the Garble circuits |
| `packages/settle`, `oracle`, `plugins` | Escrow scan and FROST payouts; market resolution |
| `packages/sdk`, `ascii`, `brand` | Browser client, ASCII renderer, design tokens |

## Run it

```sh
pnpm install && pnpm test && cargo test --workspace
pnpm --filter @zpredict/web dev:mock     # app + three mock relayers on :3000
pnpm --filter @zpredict/web e2e          # the app in headless Chrome against them
apps/relayer/scripts/dev.sh              # three real relayers with MPC
scripts/relayer-e2e.sh                   # regtest: deposit → trade → resolve → withdraw
```

MIT · Built for ZECATHON 2026.
