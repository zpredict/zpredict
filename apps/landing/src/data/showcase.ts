/** Copy for the lime showcase the hero canvas shrinks into: the market engine in one screen. */
export const showcase = {
	eyebrow: "Market engine / shielded",
	title: ["Orders in pieces.", "Prices in public."],
	description:
		"Your browser cuts every order into three random shares. Three relayers cross them inside MPC, batch after batch, at the midpoint. The price prints; nobody learns who moved it.",
	facts: [
		{
			title: "Split in three",
			text: "Each relayer holds one XOR share of your order. On its own, a share is random noise.",
		},
		{
			title: "Crossed in MPC",
			text: "YES p meets NO q when p + q ≥ 1. Only the clearing price is public; unfilled orders are never opened.",
		},
		{
			title: "Paid from Ironwood",
			text: "One FROST-signed batch pays every winner to a fresh shielded address.",
		},
	],
	caption: ["Live 3D / ASCII", "Scroll on to the markets"],
};
