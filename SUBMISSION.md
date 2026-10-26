# Submission

Text for the ZECATHON submission form. Every sentence must stay true of `main` and the live demo.

## Form fields

- **Project name:** zPredict
- **Track:** Private Markets
- **Code repository:** https://github.com/zpredict/zpredict
- **Working demo:** https://app.zpredict.site (site: https://zpredict.site)
- **Demo video:** https://zpredict.site/pitch/ (1:14)

## Description (≤ 2,000 characters — paste as-is)

<!-- DESCRIPTION START -->
WHAT IT DOES
The first prediction market on Zcash where nobody can see that you bet. Polymarket traders get traced to real names; here no chain observer, single operator or counterparty learns who bet, which side or how much. Price public, participants private.

HOW
- Orders: XOR-shared in your browser, one share per relayer.
- Matching: three relayers cross YES/NO at the midpoint inside 3-party MPC (polytune), checking balances in-circuit. Only fills and a public clearing price come out.
- Accounts: your account secret never leaves the browser whole; the circuit checks it, so no relayer can spend for you.
- Escrow: FROST 2-of-3 Ironwood address from a DKG; batched payouts, each signer re-derives the sighash.
- Resolution: Zcash mainnet block data (incl. hourly markets) or Polymarket for 21 mirrored markets; outcomes FROST-signed, checked in the browser.

WHY IT DOES NOT LEAK
- Chain: shielded (Ironwood) only; no transparent address in any path.
- One relayer sees uniformly random shares and digests. Reading orders needs all three; moving funds needs two.
- Fixed deposit denominations; batched payouts to fresh addresses.
- Static frontend, strict CSP; no third-party requests, analytics or IP logs. Audit + verify-it-yourself: PRIVACY.md.

WHAT IS REAL / WHAT IS A MOCK
Real: 3-party MPC matching, in-circuit balances and credentials, FROST DKG, chain-data resolution, live relayers, and a full testnet cycle on the live demo: deposit 8a4bc247… → fill → signed outcome → 2-of-3 Ironwood payout 67d93312… (docs: Evidence).
Demo limits: judge mode credits mock collateral (not withdrawable); judge orders fill against a labelled self-trade; operator-seeded demo trades set prices; all three relayers and the DKG ran on one VM, whose operator sees what they see (the model needs independent operators); relayers see deposit/withdrawal amounts and timing.

TRY IT
app.zpredict.site → Judge mode → bet. Relayer View: what each relayer holds is noise.
<!-- DESCRIPTION END -->

## Video script (1:14)

A pitch cut from real footage: the app is the hero, one idea per shot, captions only (no voiceover, no music). Built by `apps/video` (Remotion): `scripts/capture.mjs` records the live app, site and docs with headless Chrome, `src/config.ts` holds the cut. Shot list with cameras: `apps/video/SHOTLIST.md`.

| Time | Shot | Caption |
|---|---|---|
| 0:00–0:05 | Black, typed: the problem | "Every bet on Polymarket is public." / "Wallets get traced to real people." |
| 0:05–0:10 | zpredict.site hero: the ASCII Z, lime strips | "zPredict: a prediction market on Zcash that hides who bet." |
| 0:10–0:21 | app.zpredict.site home, then the market list: Polymarket mirrors with images | "No relayer, chain observer or counterparty learns who bet." / "Live markets mirrored from Polymarket. Prices public, bettors hidden." |
| 0:21–0:30 | Judge mode → trade page (balance 0.25 ZEC); YES, type 0.1 ZEC, Split & send | "Judge mode: a demo account with mock collateral. No wallet." / "Pick a side, type an amount in ZEC, split & send." |
| 0:30–0:42 | **Relayer View**: three panels, your share lit lime in each, key bytes masked | "Your browser splits the order into three random shares." / "Relayers match orders in 3-party MPC. One share alone decodes nothing." |
| 0:42–0:48 | Close-up: R0, R1, R2 and the ⊕ row decoded in the browser | "Only your browser XORs them back: market 11 · YES · 92¢ · 10 contracts." |
| 0:48–0:53 | Resolved hourly market: outcome, block hash, "Signed by 2-of-3 relayers ✓" | "Outcomes from Zcash blocks, signed 2-of-3, checked in your browser." |
| 0:53–0:59 | app.zpredict.site/threat-model: who learns what | "Who learns what, including the demo's limit: one VM, three relayers." |
| 0:59–1:05 | docs, Evidence: the testnet cycle, deposit `8a4bc247…b62de82d` → fill → FROST-signed outcome → 2-of-3 payout `67d93312…10620a16` | "On Zcash testnet: deposit, fill, signed outcome, 2-of-3 payout." |
| 1:05–1:14 | app home; end card: zPredict, "Price public. Participants private.", zpredict.site | — |

This take has no fill on screen: the live relayers' batches were stalled (batch 19917) while it was recorded, so the order shows "Waiting for batch 19917 to clear…". The cut has a fill shot ready (`TRADE.fill` in `src/config.ts`); recapture once batches move and it cuts in. Record against the live demo (wait for `/health` peers `[true,true,true]` on r0, r1, r2 and a moving batch number). Full txids: docs, Evidence.
