# Submission

Text for the ZECATHON submission form. Every sentence must stay true of `main` and the live demo.

## Form fields

- **Project name:** zPredict
- **Track:** Private Markets
- **Code repository:** https://github.com/zpredict/zpredict
- **Working demo:** https://app.zpredict.site (site: https://zpredict.site)
- **Demo video:** https://zpredict.site/pitch/ (1:26)

## Description (≤ 2,000 characters — paste as-is)

<!-- DESCRIPTION START -->
WHAT IT DOES
The first prediction market on Zcash where nobody can see that you bet. Polymarket traders get traced to real names; here no chain observer, single operator or counterparty learns who bet, which side or how much. Price public, participants private.

HOW
- Orders: XOR-shared in your browser, one share per relayer.
- Matching: three relayers cross YES/NO at the midpoint inside 3-party MPC, checking balances in-circuit. Only fills and a public clearing price come out.
- Accounts: your account secret never leaves the browser whole; the circuit checks it, so no relayer can spend for you.
- Escrow: FROST 2-of-3 Ironwood address from a DKG; batched payouts.
- Resolution: 20 markets mirror Polymarket; hourly ones read Zcash blocks. Outcomes FROST-signed, checked in the browser.

WHY IT DOES NOT LEAK
- Chain: shielded (Ironwood) only; no transparent address in any path.
- One relayer sees uniformly random shares and digests. Reading orders needs all three; moving funds needs two.
- Deposits of any amount, split into fixed notes (0.01–25 ZEC); batched payouts to fresh addresses.
- Static frontend, strict CSP; no third-party requests, analytics or IP logs. Audit + verify-it-yourself: PRIVACY.md.

WHAT IS REAL / WHAT IS A MOCK
Real: 3-party MPC matching, in-circuit balances and credentials, FROST DKG, chain-data resolution, live relayers, and a full testnet cycle on the live demo: deposit 8a4bc247… → fill → signed outcome → 2-of-3 Ironwood payout 67d93312…; again Oct 27: 3-note deposit 6978b674…, payout a61b3005… (docs: Evidence).
No mock credit: every balance is a real testnet deposit (one-click faucet). Demo limits: each order is paired with its opposite from the same account (self-trade) so it fills; seeded trades set prices; the three relayers and the DKG share one VM (the model needs independent operators); relayers see deposit/withdrawal amounts and timing.

TRY IT
app.zpredict.site → Get testnet ZEC → bet → withdraw. Relayer View: each relayer holds noise.
<!-- DESCRIPTION END -->

## Video script (1:26)

A pitch cut from real footage: the app is the hero, one idea per shot, captions plus a voiceover (ElevenLabs, voice George, credited on the end card; no music). Built by `apps/video` (Remotion): `scripts/capture.mjs` records the live app, site and docs with headless Chrome, `src/config.ts` holds the cut and each shot's narration line, and `scripts/voice.mjs` speaks them. Shot list with cameras: `apps/video/SHOTLIST.md`.

| Time | Shot | Caption |
|---|---|---|
| 0:00–0:05 | Black, typed: the problem | "Every bet on Polymarket is public." / "Wallets get traced to real people." |
| 0:05–0:10 | zpredict.site hero: the ASCII Z, lime strips | "zPredict: a prediction market on Zcash that hides who bet." |
| 0:10–0:23 | app.zpredict.site home, then the market list: Polymarket mirrors with images | "No relayer, chain observer or counterparty learns who bet." / "Live markets mirrored from Polymarket. Prices public, bettors hidden." |
| 0:23–0:32 | An account funded by a real testnet deposit → Trade now; YES, type 0.01 ZEC, Split & send | "A real testnet deposit funds the account. No mock balances." / "Pick a side, type an amount in ZEC, split & send." |
| 0:32–0:45 | **Relayer View**: three panels, your share lit lime in each, key bytes masked | "Your browser splits the order into three random shares." / "Relayers match orders in 3-party MPC. One share alone decodes nothing." |
| 0:45–0:51 | The batch clears: each relayer's FILL row gets its fill share ("Batch cleared") | "Matched inside 3-party MPC. The fill comes back as three shares too." |
| 0:51–0:57 | Close-up: R0, R1, R2, the ⊕ row decoded, "Filled 1 shares for 0.0092 ZEC … only you can open this", 9 s after send | "Only your browser XORs the shares back: filled 1 YES share at 92¢." |
| 0:57–1:03 | Resolved hourly market: outcome, block hash, "Signed by 2-of-3 relayers ✓" | "Outcomes from Zcash blocks, signed 2-of-3, checked in your browser." |
| 1:03–1:10 | app.zpredict.site/threat-model: who learns what | "Who learns what, including the demo's limit: one VM, three relayers." |
| 1:10–1:17 | docs, Evidence: the testnet cycle, deposit `8a4bc247…b62de82d` → fill → FROST-signed outcome → 2-of-3 payout `67d93312…10620a16` | "On Zcash testnet: deposit, fill, signed outcome, 2-of-3 payout." |
| 1:17–1:26 | app home; end card: zPredict, "Price public. Participants private.", zpredict.site | — |

Record against the live demo (wait for `/health` peers `[true,true,true]` on r0, r1, r2 and a moving batch number). Full txids: docs, Evidence.
