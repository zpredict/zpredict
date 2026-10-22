// Static copy from DESIGN.md "Threat model". Keep in sync with DESIGN.md.

export const THREATS = [
	{
		observer: "Chain observer",
		learns: "The escrow address exists and makes batched shielded transactions",
		not: "Who bet, which side, how much, who won",
	},
	{
		observer: "Any single relayer",
		learns: "“A 5-unit deposit arrived” (shared viewing key)",
		not: "Orders, sides, prices, positions, which deposit belongs to which payout",
	},
	{
		observer: "2 colluding relayers",
		learns: "Same as one for orders; can move escrow funds (FROST 2-of-3)",
		not: "Orders (the MPC needs all 3 to collude)",
	},
	{ observer: "All 3 colluding", learns: "Everything", not: "—" },
	{
		observer: "Counterparty",
		learns: "That a fill happened at the midpoint",
		not: "Who you are, your size beyond the fill",
	},
	{
		observer: "Network observer",
		learns: "That someone talks to a zPredict relayer",
		not: "Contents (TLS); your IP if you use Tor",
	},
] as const;

export const SPLIT_STATEMENT =
	"Funds are 2-of-3, order privacy is 3-of-3. We state this split openly.";

export const LEAK_CHECKLIST = [
	"No transparent address in any product path: deposits, payouts, refunds, change.",
	"Deposits only in fixed denominations; never reveal order size.",
	"Payouts batched per epoch to fresh diversified, shielded-only addresses.",
	"Wallet-default fee (ZIP 317) and expiry (ZIP 315); padded actions.",
	"Memos carry no order data and no plaintext tags.",
	"The browser shares orders; each share goes straight to its own relayer on its own host.",
	"Frontend is static and self-hosted: no CDN, no third-party fonts, no analytics. Relayers log no IPs.",
	"Viewing keys never leave the relayers; never shown in the UI or logs.",
] as const;

/** What this build fakes today. Update with SUBMISSION.md "Real / Mock". */
export const MOCKS = [
	"Judge mode credits a demo balance directly; no testnet deposit happens.",
	"The escrow address shown in Deposit is a placeholder until the FROST DKG runs.",
	"With the local mock relayers, one process combines the shares in the clear instead of running MPC.",
] as const;
