export interface Step {
	title: string;
	text: string;
	/** Lines of the mono terminal panel shown while the step is active. `**x**` marks lime text. */
	panel: string[];
}

/** The pinned "How it works" process: what happens to one bet, start to payout. */
export const steps: Step[] = [
	{
		title: "Deposit shielded ZEC.",
		text: "Send any amount, split into fixed-size notes (0.01 to 25 ZEC), from a Zcash wallet to the escrow's Ironwood address. The memo holds only encrypted shares of a random account tag. No account, no KYC.",
		panel: [
			"$ zcash send --to escrow.ironwood",
			"",
			"  note   **0.05 ZEC**",
			"  pool   Ironwood (shielded)",
			"  memo   0xFF · tag 7f3a… (encrypted)",
			"",
			"relayer A  +0.05 ZEC to a shared balance",
			"relayer B  +0.05 ZEC to a shared balance",
			"relayer C  +0.05 ZEC to a shared balance",
			"",
			"who sent it      **hidden**",
		],
	},
	{
		title: "Split your order.",
		text: "Your browser cuts {market, side, price, size} into three XOR shares and sends each one straight to its own relayer. No server ever holds two.",
		panel: [
			"order  { nu7-mainnet, YES, 0.71, 5 }",
			"",
			"share A  9f3a c1e0 27bd 04af e86c",
			"share B  b55d 1a90 7e42 cc03 5f18",
			"share C  06e2 f4b7 913c 2ad9 b07e",
			"",
			"A ⊕ B ⊕ C  = order",
			"A, B or C  = **noise**",
		],
	},
	{
		title: "Crossed inside MPC.",
		text: "Every batch, the three relayers cross YES p with NO q when p + q ≥ 1, at the midpoint, inside a polytune circuit. Only the clearing price is public.",
		panel: [
			"batch 0412   market nu7-mainnet",
			"",
			"  YES 0.71 × NO 0.32   sum 1.03 ≥ 1",
			"  fill at midpoint   **0.695**",
			"",
			"public     clearing price 0.69",
			"private    who, side, size",
			"unfilled   **never opened**",
		],
	},
	{
		title: "Resolved and paid.",
		text: "At the resolve height each relayer reads the block and signs the outcome with FROST. One batched Ironwood transaction pays every winner to a fresh address.",
		panel: [
			"block 3,543,405  NU7 active → **YES**",
			"",
			"FROST 2-of-3   signed  ✓",
			"payout tx      1 batch, padded",
			"  → fresh address   ••••••",
			"  → fresh address   ••••••",
			"  → fresh address   ••••••",
			"",
			"on-chain deposit → payout link   **none**",
		],
	},
];
