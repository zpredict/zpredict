export interface Faq {
	q: string;
	a: string;
}

export const faq: Faq[] = [
	{
		q: "Do I need an account?",
		a: "No. You deposit fixed-size notes from any Zcash wallet and your browser keeps a random account tag. No email, no KYC.",
	},
	{
		q: "What does a relayer see?",
		a: "One XOR share of each order: random bytes. It sees deposit and withdrawal amounts and times (and the withdrawal address), never who bet, which side, or how much. The threat model lists the limits of the hosted demo.",
	},
	{
		q: "What if relayers collude?",
		a: "Two of three can move escrow funds (FROST 2-of-3). Reading orders takes all three inside MPC. The threat model above lists what each party learns.",
	},
	{
		q: "How is a market resolved?",
		a: "Mirrored markets follow Polymarket's public result; the hourly demo market reads Zcash chain data at a fixed block height. Each relayer reads the source on its own, two of three FROST-sign the outcome, and your browser checks the signature.",
	},
	{
		q: "How do winners get paid?",
		a: "One batched, threshold-signed Ironwood transaction pays every winner to a fresh shielded address, with the default fee and wallet-default padding.",
	},
	{
		q: "Is it on mainnet?",
		a: "Not yet. It runs on Zcash testnet for Zecathon 2026. One click gets you real testnet ZEC from our faucet, so there is nothing to install.",
	},
];
