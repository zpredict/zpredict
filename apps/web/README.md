# @zpredict/web

The zPredict trading app: markets, order ticket, **Relayer View** (the split screen), judge mode and the threat model. Next.js App Router, `output: "export"`: a static site that talks to the three relayers directly from the browser. No Next server, no analytics, no third-party requests.

UI is adapted from the MotionSites **Crypto Vault** template (`crypto-vault`): its tokens, split rounded panes, Figtree / Instrument Sans type, pills, white CTA and blur-in motion. Fonts and the template video are self-hosted.

## Run it

```sh
pnpm install
pnpm --filter @zpredict/web dev:mock   # 3 mock relayers on :4101-4103 + next dev on :3000
```

Open http://localhost:3000, click **Judge mode** (mock credit of 25 units), place an order, and watch the three relayer panels. A fill shows up within one batch (5 s).

Other scripts:

| Command | What |
|---|---|
| `pnpm --filter @zpredict/web mock` | only the mock relayers (`MOCK_PORTS`, `MOCK_BATCH_MS`, `MOCK_BOT_MS`) |
| `pnpm --filter @zpredict/web build` | static export to `out/`, then the privacy gate |
| `pnpm --filter @zpredict/web test` | mock clearing rule against `packages/core` test vectors |

Relayer URLs are baked in at build time from `NEXT_PUBLIC_RELAYERS="url0,url1,url2"`; the default is the hosted testnet relayers `https://r{0,1,2}.zpredict.site`.

**Deposits** (trade page, "Deposit") work like this:
1. Pick 1, 5 or 25 units.
2. Create an account tag in the browser, or keep the judge tag.
3. Copy or open the ZIP 321 payment request: the escrow UA, the exact amount, and a memo holding the tag encrypted to each relayer's `GET /memo-key`. Every view builds a fresh memo.

The escrow address is baked in from `NEXT_PUBLIC_ESCROW_UA` (published by the DKG). Without it, the flow says it isn't live yet and points to judge mode. Try it locally with `NEXT_PUBLIC_ESCROW_UA=utest1… pnpm --filter @zpredict/web dev:mock`: the mock relayers serve memo keys, but they don't scan deposits.

## Privacy gate

`scripts/privacy.mjs` runs after every build and fails it if any file in `out/` references a real host other than ours. Inert strings are allowed and listed in the script: XML namespaces, the core-js license banner, and doc links inside React/Next error messages (never fetched).

## Mock relayer

`mock-relayer/src` implements the relayer API from DESIGN.md with the real clearing rule (`clearing.mjs` is a port of `zpredict_core::clear` and `fill_records`, tested against `packages/core/testdata/vectors.json`). Background bots trade through the same share path, so every batch has counterparties. Markets mirror the landing (`apps/landing/src/data/markets.ts`) at future mainnet heights; each batch that crosses publishes the public `lastPrice` and appends it to `history`, and 24 warm-up batches at startup mean the cards have a price and sparkline on first load.

**Mock:** the three relayers share one process and combine shares in the clear; the real ones run the batch inside 3-party MPC and never see each other's shares. Judge mode credits balance directly instead of a testnet deposit.

## Layout

```
app/          routes only (compose components)
components/   ui/ primitives, then one folder per feature
hooks/        data hooks (account, orders, markets, relayer view, health, judge)
lib/          config, relayer client over @zpredict/sdk, formatting, share XOR, storage
content/      static copy (threat model)
styles/       tokens + one stylesheet per area
mock-relayer/ local relayers for dev and demo
```
