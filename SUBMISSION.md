# Submission

Text for the ZECATHON submission form. Every sentence must stay true of `main` and the live demo.

## Form fields

- **Project name:** zPredict
- **Track:** Private Markets
- **Code repository:** https://github.com/zpredict/zpredict
- **Working demo:** https://app.zpredict.site (site: https://zpredict.site)
- **Demo video:** https://zpredict.site/pitch/ (1:23)

## Description (≤ 2,000 characters — paste as-is)

<!-- DESCRIPTION START -->
WHAT IT DOES
The first prediction market on Zcash where nobody can see that you bet. Polymarket traders get traced to real names; here no chain observer, operator or counterparty learns who bet, which side or how much.

HOW
- Orders: XOR-shared in your browser, one share per relayer.
- Matching: three relayers cross YES/NO at the midpoint inside 3-party MPC, checking balances in-circuit. Only fills and a public price come out.
- Accounts: your account secret never leaves the browser whole; the circuit checks it, so no relayer can spend for you.
- Escrow: FROST 2-of-3 Ironwood address from a DKG; batched payouts.
- Resolution: 24 markets mirror Polymarket; hourly ones read Zcash blocks. Outcomes FROST-signed, checked in-browser.

WHY IT DOES NOT LEAK
- Chain: shielded (Ironwood) only; no transparent address in any path.
- One relayer sees only random shares and digests. Reading orders needs all three; moving funds needs two.
- Deposits of any amount, split into fixed notes (0.01–25 ZEC); batched payouts to fresh addresses.
- Static app, strict CSP; no third-party requests, analytics or IP logs (GA4: landing/docs only). Audit: PRIVACY.md.

WHAT IS REAL / WHAT IS A MOCK
Real: 3-party MPC matching, in-circuit balances and credentials, FROST DKG, chain-data resolution, live relayers, and full testnet cycles: deposit 8a4bc247… → fill → signed outcome → 2-of-3 Ironwood payout 67d93312…; again Oct 27: 3-note deposit 6978b674…, payout a61b3005… (see Evidence).
No mock credit: every balance is a real testnet deposit (one-click faucet). Demo limits: each order is paired with its opposite from the same account (self-trade) so it fills; seeded trades set prices; the three relayers and the DKG share one VM (the model needs independent operators); relayers see deposit/withdrawal amounts and times.

STACK
Rust (polytune MPC, FROST RedPallas, librustzcash), Next.js. Testnet escrow, mainnet oracle.

TRY IT
app.zpredict.site → Get testnet ZEC (credited in ~7 min) → bet → withdraw.
<!-- DESCRIPTION END -->

## Video script (1:23)

A pitch cut from real recordings of the live app, site and docs (`apps/video`, Remotion): one idea per shot, captions, and an ElevenLabs voiceover trimmed so the read flows across cuts. The deposit, trade and account takes use an account funded by a real testnet deposit; the order filled 11 s after send. Shot list and cameras: `apps/video/SHOTLIST.md`.

| Time | Footage | Caption | Narration |
|---|---|---|---|
| 0:00–0:05 | type | Every bet on Polymarket is public. / Wallets get traced to real people. | Every bet on Polymarket is public. Wallets get traced back to real people. |
| 0:05–0:10 | landing | zPredict: a prediction market on Zcash that hides who bet. | zPredict is a prediction market on Zcash that hides who bet. |
| 0:10–0:14 | home | No relayer, chain observer or counterparty learns who bet. | No relayer, no chain observer and no counterparty learns who you are. |
| 0:14–0:20 | home | Live markets mirrored from Polymarket. Prices public, bettors hidden. | The markets mirror Polymarket. Prices stay public. Bettors stay hidden. |
| 0:20–0:26 | deposit | Deposit any amount. It is split into standard notes. | Deposit any amount from your own Zcash wallet. It is split into standard notes, so no amount stands out. |
| 0:26–0:29 | deposit | One request, one shielded transaction, from any testnet wallet. | One request, one shielded transaction. |
| 0:29–0:33 | trade | Pick a side, type an amount in ZEC, split & send. | Pick a side, enter an amount in ZEC, and send. |
| 0:33–0:38 | trade | Your browser splits the order into three random shares. | Your browser splits the order into three random shares, one for each relayer. |
| 0:38–0:45 | trade | Relayers match orders in 3-party MPC. One share alone decodes nothing. | The relayers match orders inside multi-party computation. Each one sees only noise. |
| 0:45–0:48 | trade | Matched inside 3-party MPC. The fill comes back as three shares too. | The fill comes back the same way, as three shares. |
| 0:48–0:51 | trade | Only your browser XORs the shares back into the fill. | Only your browser can put them back together. |
| 0:51–0:58 | account | Portfolio and P&L, computed only in your browser. | Your portfolio and profit and loss are computed only in your browser. The relayers never see them. |
| 0:58–1:03 | resolved | Outcomes from Zcash blocks, signed 2-of-3, checked in your browser. | Outcomes are signed by two of three relayers, and your browser checks the signature. |
| 1:03–1:09 | threat | Who learns what, including the demo's limit: one VM, three relayers. | Here is exactly who learns what, including today's limit: one server runs all three relayers. |
| 1:09–1:16 | evidence | On Zcash testnet: deposit, fill, signed outcome, 2-of-3 payout. | And it works end to end on Zcash testnet: deposit, fill, signed outcome, and payout. |
| 1:16–1:19 | home | — | — |
| 1:19–1:22 | end | — | zPredict. Price public. Participants private. |
