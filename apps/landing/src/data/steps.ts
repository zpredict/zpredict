export type StepArt = "escrow" | "shares" | "payout";

export interface Step {
	n: string;
	art: StepArt;
	tag: string;
	/** Display lines of the uppercase title. */
	title: [string, string];
	desc: string;
}

/** The three steps a bettor actually does. */
export const steps: Step[] = [
	{
		n: "01",
		art: "escrow",
		tag: "1 · 5 · 25 ZEC notes",
		title: ["Deposit", "shielded ZEC"],
		desc: "Send a fixed-size note from any Zcash wallet. No account, no email, no KYC.",
	},
	{
		n: "02",
		art: "shares",
		tag: "Split in 3",
		title: ["Place", "your bet"],
		desc: "Pick YES or NO. Your browser splits the order into three shares; no server sees it whole.",
	},
	{
		n: "03",
		art: "payout",
		tag: "Fresh address",
		title: ["Get", "paid"],
		desc: "When the block lands, winners are paid to a fresh shielded address in one batched transaction.",
	},
];

export interface PipelineStage {
	name: string;
	detail: string;
}

/** What happens underneath, for the "Technical details" disclosure. */
export const pipeline: PipelineStage[] = [
	{
		name: "FROST 2-of-3 escrow",
		detail:
			"Deposits go to an Ironwood address whose key is split between three relayers by DKG. Any two can sign; none can spend alone.",
	},
	{
		name: "Secret-shared orders",
		detail:
			"{market, side, price, size} is XOR-split into three shares in the browser; each goes straight to its own relayer over TLS.",
	},
	{
		name: "Crossing in 3-party MPC",
		detail:
			"Every batch, the relayers cross YES p with NO q when p + q ≥ 1, at the midpoint, inside a polytune circuit. Unfilled orders are never opened.",
	},
	{
		name: "Resolution from chain data",
		detail:
			"At the resolve height each relayer reads its own node (NU7 branch ID, Ironwood note count, shielded action count) and signs the outcome with FROST.",
	},
	{
		name: "Batched Ironwood payouts",
		detail:
			"One threshold-signed transaction per epoch pays every winner and withdrawal to fresh diversified addresses, with padded actions and the default fee.",
	},
];
