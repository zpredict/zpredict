# Submission draft

Working target. Code is built to make every sentence below true. Update the "Real / Mock" list honestly before submitting.

## Form fields

- **Project name:** zPredict
- **Track:** Private Markets
- **Code repository:** https://github.com/zpredict/zpredict
- **Working demo:** https://<demo-host>
- **Demo video:** https://<video-link> (2:00)

## Description (≤ 2,000 characters — paste as-is)

<!-- DESCRIPTION START -->
WHAT IT DOES
zPredict is the first prediction market on Zcash, and the first where nobody can see that you bet. Polymarket traders keep getting traced to real names; on zPredict, no chain observer, no operator and no counterparty learns who bet, which side, or how much.

HOW
- Escrow: a FROST 2-of-3 shielded address. Three relayers ran DKG; none can move funds alone.
- Orders: secret-shared in your browser; each share goes straight to a different relayer.
- Matching: the relayers cross YES and NO orders at the midpoint inside 3-party MPC (polytune). Unfilled orders are never opened.
- Resolution: markets resolve from Zcash chain data, so anyone can check the outcome.
- Settlement: one batched, FROST-signed Ironwood transaction per epoch pays each winner to a fresh shielded address.

WHY IT DOES NOT LEAK
- Chain: shielded only. No transparent address in any path: deposits, payouts, change.
- Amounts: deposits are fixed denominations, so they never reveal a bet size.
- Timing: payouts are batched, breaking deposit→payout links.
- Operators: one relayer sees only random shares. Order privacy needs all three to collude; moving funds needs two. We state this split openly.
- Metadata: static frontend, no third-party requests, no analytics, no IP logs. Full audit in PRIVACY.md.

WHAT IS REAL / WHAT IS A MOCK
Real: FROST DKG and threshold signing, shielded deposits and payouts on testnet, 3-party MPC matching, chain-data resolution, Relayer View.
Mock: <fill in honestly before submitting>

TRY IT
Open the demo, choose judge mode (prefunded testnet wallet), bet on a live market. The Relayer View shows what each relayer sees: noise.
<!-- DESCRIPTION END -->

## Video script (2:00)

| Time | Shot | Line |
|---|---|---|
| 0:00–0:15 | Headline: a Polymarket whale traced to a real name | "On today's prediction markets, every bet is public — and people get found." |
| 0:15–0:35 | zPredict: a live market on NU7 activation; deposit, buy YES | "zPredict is a prediction market on Zcash. Your collateral goes to an escrow no one controls alone." |
| 0:35–1:05 | **Split screen**: three relayers showing random shares; the trader's fill appears | "Three relayers matched this bet. None of them knows what you bet." |
| 1:05–1:20 | Block explorer: one shielded transaction, nothing readable | "On chain: nothing." |
| 1:20–1:30 | Market resolves from a block; payout lands in a fresh address | "It resolves from the chain itself, and pays you somewhere new." |
| 1:30–2:00 | Threat-model table | "Here is exactly what each party can and can't learn. Price public. Participants private." |
