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

## Privacy gate

`scripts/privacy.mjs` runs after every build and fails it if any file in `out/` references a real host other than ours. Inert strings are allowed and listed in the script: XML namespaces, the core-js license banner, and doc links inside React/Next error messages (never fetched).

## Mock relayer

`mock-relayer/src` implements the relayer API from DESIGN.md with the real clearing rule (`clearing.mjs` is a port of `zpredict_core::clear` and `fill_records`, tested against `packages/core/testdata/vectors.json`). Background bots trade through the same share path, so every batch has counterparties.

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
