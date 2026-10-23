# @zpredict/web

The zPredict trading app: markets, order ticket, **Relayer View** (the split screen), judge mode and the threat model. Next.js App Router, `output: "export"`: a static site that talks to the three relayers directly from the browser. No Next server, no analytics, no third-party requests.

UI follows the MotionSites **ASCII Studio** template (`ascii-studio`, issue #62): tokens from `@zpredict/brand/tokens.css`, JetBrains Mono 500 only (self-hosted via `next/font/local`, preloaded), lime on `#050505`, square corners, no shadows, lime CTA blocks, a top-sheet menu, lime/paper sections and text scramble (`lib/scramble.ts`). The hero is `@zpredict/ascii`: `components/hero/AsciiHero.tsx` (server) renders the build-time snapshot, the LCP and the no-WebGL / reduced-motion view; `AsciiLive.tsx` loads Three.js in its own chunk after `load` + idle and fades the live canvas in.

## Run it

```sh
pnpm install
pnpm --filter @zpredict/web dev:mock   # 3 mock relayers on :4101-4103 + next dev on :3000
```

Open http://localhost:3000, click **Judge mode** (mock credit of 25 units), place an order, and watch the three relayer panels. A fill shows up within one batch (5 s).

Judge mode makes one account per browser (its tag lives in `localStorage`; a claim that fails halfway is retried with the same tag, so it never takes a second table row). The relayers' balance table has a fixed number of rows (`table_rows`). When it is full, Judge mode says so instead of creating an account, and an account that only has a row past the cap (a deposit that arrived after the table filled) gets a clear notice on the order ticket rather than orders that never fill.

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
3. Copy or open the ZIP 321 payment request: the escrow UA, the exact amount, and a memo giving each relayer (encrypted to its `GET /memo-key`) the account id and its own share of the tag, never the tag. Every view builds a fresh memo.

The escrow address is baked in from `NEXT_PUBLIC_ESCROW_UA` (published by the DKG). Without it, the flow says it isn't live yet and points to judge mode. Try it locally with `NEXT_PUBLIC_ESCROW_UA=utest1… pnpm --filter @zpredict/web dev:mock`: the mock relayers serve memo keys, but they don't scan deposits.

**Withdrawals** (trade page, "Withdraw", once the account has a tag): an amount in units and a fresh unified address with an Ironwood (Orchard) receiver. Each relayer receives only a fresh XOR share of the tag with the public amount and address (`submitWithdrawal`), so no relayer learns whose withdrawal it is or can forge one; the status (`pending → debited → paying → paid`, or `refused` if the balance doesn't cover it) comes from relayer 0, with the txid once broadcast. The mock relayers combine the shares, debit and report a made-up txid. A judge-mode tag gets a short explanation instead of the form: its credit is mock collateral, so it is never withdrawable (#104).

## Privacy gate

`scripts/privacy.mjs` runs after every build and fails it if any file in `out/` references a real host other than ours. Inert strings are allowed and listed in the script: XML namespaces, the core-js license banner, and doc links inside React/Next error messages (never fetched).

## Mock relayer

`mock-relayer/src` implements the relayer API from DESIGN.md with the real clearing rule (`clearing.mjs` is a port of `zpredict_core::clear` and `fill_records`, tested against `packages/core/testdata/vectors.json`). Background bots trade through the same share path, so every batch has counterparties. Markets mirror the landing (`apps/landing/src/data/markets.ts`) at future mainnet heights; each batch that crosses publishes the public `lastPrice` and appends it to `history`, and 24 warm-up batches at startup mean the cards have a price and sparkline on first load.

Rolling markets follow the relayers' scheme (a window every 48 mock blocks, one block per batch) and resolve unsigned, as the hosted relayers do before the key ceremony. Two past windows are replayed from `packages/settle/testdata/outcome-vectors.json` with their real FROST 2-of-3 test signatures, and `/group-key` serves that test group key, so "Signed by 2-of-3 relayers ✓" is checked in the browser against real data.

**Mock:** the three relayers share one process and combine shares in the clear; the real ones run the batch inside 3-party MPC and never see each other's shares. Judge mode credits balance directly instead of a testnet deposit; the tag is still made in the browser, and each relayer gets only its share (`claimJudge`).

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
