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
		a: "One XOR share of each order: random bytes. It learns that a deposit arrived, never who bet, which side, or how much.",
	},
	{
		q: "What if relayers collude?",
		a: "Two of three can move escrow funds (FROST 2-of-3). Reading orders takes all three inside MPC. The threat model above lists what each party learns.",
	},
	{
		q: "How is a market resolved?",
		a: "From Zcash chain data at a fixed block height. Each relayer reads its own node and signs the outcome with FROST; it is published with the block hash, so anyone can recompute it.",
	},
	{
		q: "How do winners get paid?",
		a: "One batched, threshold-signed Ironwood transaction pays every winner to a fresh shielded address, with the default fee and wallet-default padding.",
	},
	{
		q: "Is it on mainnet?",
		a: "Not yet. It runs on Zcash testnet for Zecathon 2026. Judge mode includes a prefunded testnet wallet, so there is nothing to install.",
	},
];
