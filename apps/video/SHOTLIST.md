# zPredict demo: shot list (1:20)

The pitch at https://zpredict.site/pitch/. Every frame of product is a real headless-Chrome recording
of the live app, site and docs (`scripts/capture.mjs`); the only drawn frames are the opening line
and the end card. Durations, focal points and captions live in `src/config.ts`.

Rules for the cut: the app is the hero; hard cuts; one slow push per shot, anchored on what the
caption names; captions sit in a solid band under the footage, never on page text; no music.

| Time | Act | Shot (source clip) | Camera | Caption |
|---|---|---|---|---|
| 0:00–0:05 | A problem | Black. Typed: "Every bet on Polymarket is public." / "Wallets get traced to real people." | static | — |
| 0:05–0:10 | A product | zpredict.site hero: ASCII Z, "Bet on it. Nobody sees you. Price public. Participants private." (`landing`) | push 1.00→1.04, centre | zPredict: a prediction market on Zcash that hides who bet. |
| 0:10–0:14 | B context | app.zpredict.site home: featured market, judge-mode panel (`home`) | push 1.00→1.05 on the right panel | No relayer, chain observer or counterparty learns who bet. |
| 0:14–0:21 | B context | Scroll to "All markets": Polymarket mirrors with their images (`home`) | page scroll only | Live markets mirrored from Polymarket. Prices public, bettors hidden. |
| 0:21–0:25 | C workflow | Click Judge mode → the trade page, balance 0.25 ZEC (`trade`) | static | Judge mode: a demo account with mock collateral. No wallet. |
| 0:25–0:30 | C workflow | YES, type 0.1 into Amount, click Split & send (`trade`) | push 1.00→1.12 on the ticket | Pick a side, type an amount in ZEC, split & send. |
| 0:30–0:36 | C workflow | The shares land; scroll to the Relayer View (`trade`) | static | Your browser splits the order into three random shares. |
| 0:36–0:42 | C workflow | Relayer View: three panels, your share lit lime in each, key bytes masked (`trade`) | push 1.04→1.14 on the panels | Each relayer holds one share. Alone, it decodes nothing. |
| 0:42–0:47 | C workflow | The fill lands: "Filled N shares … only you can open this." Tag: "+N s later" (`trade`) | static | Matched inside 3-party MPC. Only your browser can open the fill. |
| 0:47–0:53 | D detail | Close-up: R0, R1, R2 and the ⊕ row decoded to market · side · price · size (`trade`) | push 1.10→1.25 on the XOR card | R0 ⊕ R1 ⊕ R2 = your order. No relayer ever holds all three. |
| 0:53–0:59 | D detail | A resolved hourly market: rules, "Outcome NO · Signed by 2-of-3 relayers ✓", block hash (`resolved`) | push 1.10→1.25 on the proof | Outcomes from Zcash blocks, signed 2-of-3, checked in your browser. |
| 0:59–1:05 | D detail | app.zpredict.site/threat-model: "Who learns what" (`threat`) | push 1.00→1.05 on the table | Who learns what, including the demo's limit: one VM, three relayers. |
| 1:05–1:11 | D detail | docs Evidence, testnet cycle table: deposit `8a4bc247…` → fill → signed outcome → payout `67d93312…` (`evidence`) | push 1.00→1.05 | On Zcash testnet: deposit, fill, signed outcome, 2-of-3 payout. |
| 1:11–1:15 | E resolution | app home, clean, no caption (`home`) | pull 1.05→1.00 | — |
| 1:15–1:20 | E resolution | End card: mark, zPredict, "Price public. Participants private.", zpredict.site · app · docs | static | — |

## Make it

```sh
pnpm install
cd apps/video
pnpm capture                       # real footage of the live app into public/footage/ (~4 min)
# copy the "trade" marks from public/footage/shots.json into TRADE in src/config.ts
pnpm studio                        # preview: npx remotion studio
pnpm render                        # npx remotion render Demo out/zpredict-demo.mp4
```

Capture against the live relayers only when `/health` on r0, r1 and r2 shows peers
`[true,true,true]` and the batch number moves; a fill needs a batch to clear (~25 s).
