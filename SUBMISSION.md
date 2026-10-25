# Submission

Text for the ZECATHON submission form. Every sentence must stay true of `main` and the live demo.

## Form fields

- **Project name:** zPredict
- **Track:** Private Markets
- **Code repository:** https://github.com/zpredict/zpredict
- **Working demo:** https://app.zpredict.site (site: https://zpredict.site)
- **Demo video:** https://zpredict.site/pitch/ (1:44)

## Description (≤ 2,000 characters — paste as-is)

<!-- DESCRIPTION START -->
WHAT IT DOES
The first prediction market on Zcash where nobody can see that you bet. Polymarket traders get traced to real names; here no chain observer, single operator or counterparty learns who bet, which side or how much. Price public, participants private.

HOW
- Orders: XOR-shared in your browser, one share per relayer.
- Matching: three relayers cross YES/NO at the midpoint inside 3-party MPC (polytune), checking balances in-circuit. Only fills and a public clearing price come out.
- Accounts: your account secret never leaves the browser whole; the circuit checks it, so no relayer can spend for you.
- Escrow: FROST 2-of-3 Ironwood address from a DKG; batched withdrawals, each signer re-derives the sighash.
- Resolution: from Zcash mainnet block data (incl. hourly markets) or per Polymarket for 21 mirrored Polymarket markets (picked from Polymarket by volume, images included); outcomes FROST-signed, checkable in the browser.

WHY IT DOES NOT LEAK
- Chain: shielded (Ironwood) only; no transparent address in any path.
- One relayer sees uniformly random shares and digests. Reading orders needs all three; moving funds needs two.
- Fixed deposit denominations; batched payouts to fresh addresses.
- Static frontend, strict CSP, no third-party requests from our code, no analytics, no IP logs. Red-team audit + verify-it-yourself commands: PRIVACY.md.

WHAT IS REAL / WHAT IS A MOCK
Real: 3-party MPC matching, in-circuit balances and credentials, FROST DKG and 2-of-3 Ironwood spends (regtest e2e incl. forged-withdrawal rejection), chain-data resolution, live relayers.
Demo limits: judge mode credits mock collateral (not withdrawable); a lone judge can add a labelled self-trade counterparty to see a fill; all three relayers and the DKG ran on one VM behind Cloudflare, which sees what they see (the model needs independent operators); relayers see deposit/withdrawal amounts and timing.

TRY IT
app.zpredict.site → Judge mode → bet (alone? tick "take the other side (demo)"). The Relayer View shows what each relayer holds: noise.
<!-- DESCRIPTION END -->

## Video script (1:44)

Colosseum-style: a pitch, not a feature tour. One idea per shot. Built by `scripts/video/` (shots.mjs records, build.mjs edits; the lines below are its captions and voiceover).

| Time | Shot | Line |
|---|---|---|
| 0:00–0:06 | Title card: the problem | "On today's prediction markets, every bet is public. And people get found." |
| 0:06–0:18 | zpredict.site hero: the ASCII Z, lime strips | "zPredict is a prediction market on Zcash. The first where nobody can see that you bet: not who, not which side, not how much." |
| 0:18–0:25 | app.zpredict.site market list: 21 Polymarket mirrors with images, Zcash-network and hourly rolling markets | "Live now: twenty-one Polymarket mirrors, plus markets on Zcash itself, every hour." |
| 0:25–0:33 | Judge mode → the NU7 market, order ticket with an Amount in ZEC | "Judge mode gives you a demo account. No wallet needed. The market: will NU7 activate at this block?" |
| 0:33–0:49 | Split & send (a second judge account buys NO in another browser). **Relayer View**: three panels, your shares lit lime; the order panel with the key bytes masked; the fill opens | "Buy YES, in ZEC. Your browser splits it into three random shares, one per relayer. Three relayers match orders inside multi-party computation. None of them knows what you bet. The fill: only your browser can open it." |
| 0:49–0:56 | Resolved rolling market: outcome, block hash, "Signed by 2-of-3 relayers ✓" | "Markets resolve from Zcash chain data. This block decided the outcome. Anyone can check it." |
| 0:56–1:14 | Regtest terminal: each relayer forges a withdrawal → refused; the payout (v6, Ironwood-only, 0 transparent) | "Settlement, on our regtest chain. Each relayer tried to forge the winner's withdrawal. All three were refused. The payout: one Ironwood transaction. Zero transparent inputs or outputs." |
| 1:14–1:24 | Testnet card: deposit `8a4bc247…b62de82d` → fill → outcome YES FROST-signed 2-of-3 (mainnet block 3,529,392) → batched 2-of-3 payout `67d93312…10620a16` | "And on public testnet, the full cycle on the live demo: deposit, fill, a signed outcome, and a two-of-three payout to an Ironwood address." |
| 1:24–1:38 | Threat-model table from PRIVACY.md | "Here is exactly what each party can and can't learn. Including what's still open: today's demo runs on one server, behind Cloudflare. Price public. Participants private." |
| 1:38–1:44 | End card | "zPredict. Bet on Zcash, without being seen." |

Record against the live demo (wait for `/health` peers `[true,true,true]` on r0, r1, r2). Full txids: docs, Evidence.
