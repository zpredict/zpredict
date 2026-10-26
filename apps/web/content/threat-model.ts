// Static copy from PRIVACY.md "Who learns what" and "Leak checklist". Every line here must
// have a matching row in PRIVACY.md; change both together.

export const THREATS = [
	{
		observer: "Chain observer",
		learns: "That shielded Ironwood transactions happen (ZIP 317 fees)",
		not: "Which transactions are the escrow's, depositors, bets, sides, sizes, winners, payout recipients",
	},
	{
		observer: "Anyone (public API)",
		learns:
			"Markets, outcomes and their signatures, one clearing price per market per crossing batch; a digest of each share a relayer received, so how many orders arrive and when",
		not: "Any share, order id, account id, balance or fill",
	},
	{
		observer: "Network observer",
		learns: "That your IP talks to *.zpredict.site; request sizes and timing",
		not: "Contents (TLS); your IP if you use Tor",
	},
	{
		observer: "VM operator (demo) ⚠",
		learns: "Everything: all three relayers run on one VM in this demo",
		not: "—",
	},
	{
		observer: "One relayer",
		learns:
			"Each deposit's amount, time and account id; each withdrawal's amount, address and time; its own share of every order, fill and balance; the public price",
		not: "Orders, sides, prices, sizes, positions, balances, any account's tag; whose withdrawal it is, except through request metadata (#90) and amount and timing (#91)",
	},
	{
		observer: "2 colluding relayers",
		learns: "As one relayer, and they can move escrow funds (FROST 2-of-3)",
		not: "Orders and tags: the third share is missing",
	},
	{ observer: "All 3 relayers", learns: "Everything", not: "—" },
	{
		observer: "Counterparty",
		learns:
			"Its own fill at the midpoint. When a single pair crossed, the midpoint and its own limit give your limit price",
		not: "Who you are, your size beyond the fill",
	},
] as const;

export const SPLIT_STATEMENT =
	"Funds are 2-of-3, order privacy is 3-of-3. ⚠ rows are limits of this hosted demo, not of the protocol.";

export const LEAK_CHECKLIST = [
	"No transparent address in any product path: deposits, payouts, change.",
	"Deposits only in fixed denominations; order size never goes on chain.",
	"Wallet-default fee (ZIP 317) and padding.",
	"Memos carry no order data and never the account tag: each slot holds the account id and one relayer's share, sealed to that relayer.",
	"Each order share goes only to its own relayer's origin (in this demo all three run on one VM).",
	"Public feeds publish digests, never shares; a fill share is served only with this browser's read token.",
	"Frontends are static and self-hosted: no third-party requests, no analytics, self-only CSP. No IP logs.",
	"Viewing keys and key shares stay sealed on the relayers; never in the UI or logs.",
	"Open: request metadata (#90) and withdrawal amount and timing (#91) can link actions to an account.",
] as const;

/** What this build fakes or limits today. Keep in sync with SUBMISSION.md "Real / Mock". */
export const MOCKS = [
	"Judge mode credits mock collateral directly; no testnet deposit happens, and judge credits can't be withdrawn.",
	"Orders cross only inside the batch they land in: a fill needs someone on the other side in the same 5-second window.",
	"All three relayers, and the key ceremony, run on one VM. The model needs three independent operators.",
	"With the local mock relayers, one process combines the shares in the clear instead of running MPC.",
] as const;
