# Submission draft

Working target. Code is built to make every sentence below true. Update the "Real / Mock" list honestly before submitting.

## Form fields

- **Project name:** zPredict
- **Track:** Private Markets
- **Code repository:** https://github.com/zpredict/zpredict
- **Working demo:** https://app.zpredict.site (site: https://zpredict.site)
- **Demo video:** https://<video-link> (2:00)

## Description (≤ 2,000 characters — paste as-is)

<!-- DESCRIPTION START -->
WHAT IT DOES
zPredict is the first prediction market on Zcash where nobody can see that you bet. Polymarket traders keep getting traced to real names; here no chain observer, no single operator and no counterparty learns who bet, which side or how much. Price public, participants private.

HOW
- Orders: split into XOR shares in your browser; each share goes only to its own relayer.
- Matching: three relayers cross YES/NO orders at the midpoint inside 3-party MPC (polytune garbled circuits), with balances checked in-circuit. Only fills and a public clearing price come out.
- Accounts: your account secret never leaves the browser whole; the circuit checks it, so no relayer can spend for you.
- Escrow: a FROST 2-of-3 Ironwood address from a DKG. Withdrawals are batched and every signer re-derives the sighash before signing.
- Resolution: markets resolve from Zcash mainnet block data (incl. hourly rolling markets); outcomes are FROST-signed and checkable in the browser.

WHY IT DOES NOT LEAK
- Chain: shielded (Ironwood) only; no transparent address in any path.
- One relayer sees uniformly random shares and digests. Reading orders needs all three; moving funds needs two.
- Fixed deposit denominations; batched payouts to fresh addresses.
- Static frontend, strict CSP, zero third-party requests, no analytics, no IP logs. Red-team audit + verification commands in PRIVACY.md.

WHAT IS REAL / WHAT IS A MOCK
Real: 3-party MPC matching, in-circuit balances and credentials, FROST DKG and 2-of-3 Ironwood spends (regtest e2e incl. forged-withdrawal rejection), chain-data resolution, live relayers.
Demo limits: judge mode credits testnet collateral without a deposit; all three relayers run on one VM (the model needs independent operators); relayers see deposit/withdrawal amounts and timing.

TRY IT
app.zpredict.site → Judge mode → bet. The Relayer View shows what each relayer holds: noise.
<!-- DESCRIPTION END -->

## Video script (2:00)

Colosseum-style: a pitch, not a feature tour. One idea per shot.

| Time | Shot | Line |
|---|---|---|
| 0:00–0:12 | Headline: a Polymarket whale traced to a real name | "Every bet on today's prediction markets is public, and people get found." |
| 0:12–0:25 | zpredict.site hero: the ASCII Z, lime strips | "zPredict is a prediction market on Zcash. Price public. Participants private." |
| 0:25–0:50 | app.zpredict.site → Judge mode → YES on a rolling market. **Relayer View**: three panels of grey noise, your shares lit lime | "Your browser splits the order into three random shares. Each relayer sees noise." |
| 0:50–1:05 | The fill lands: "YES · 55¢ · filled", visible only to you | "Three relayers matched it inside MPC. None of them knows what you bet." |
| 1:05–1:20 | Terminal: e2e run where each relayer forges a withdrawal → refused; real withdrawal mined (v6, Ironwood-only) | "No single relayer can move your money, or even pretend to be you." |
| 1:20–1:35 | Resolved market: outcome, block hash, "Signed by 2-of-3 ✓" | "Markets resolve from Zcash block data, signed by the relayers, checkable by anyone." |
| 1:35–2:00 | Threat-model table from PRIVACY.md, then the logo | "Here's exactly who learns what. Price public. Participants private. zPredict." |

Record against the live demo. Keep golden-path tx ids and screenshots from earlier runs as a fallback.
