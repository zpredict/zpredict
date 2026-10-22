export type StepArt = "escrow" | "shares" | "mpc" | "oracle" | "payout";

export interface Step {
	n: string;
	art: StepArt;
	tag: string;
	/** Display lines of the uppercase title. */
	title: [string, string];
	desc: string;
	/** Wide cards take half a row on desktop instead of a third. */
	wide?: boolean;
}

export const steps: Step[] = [
	{
		n: "01",
		art: "escrow",
		tag: "FROST 2-of-3",
		title: ["Shielded", "escrow"],
		desc: "Deposit fixed 1 / 5 / 25 notes to an escrow no single relayer can move.",
	},
	{
		n: "02",
		art: "shares",
		tag: "XOR shares",
		title: ["Shared", "orders"],
		desc: "Your browser splits each order in three. Each share goes to a different relayer.",
	},
	{
		n: "03",
		art: "mpc",
		tag: "3-party MPC",
		title: ["Crossed", "in MPC"],
		desc: "YES meets NO at the midpoint inside the circuit. Unfilled orders are never opened.",
	},
	{
		n: "04",
		art: "oracle",
		tag: "Block 3,543,405",
		title: ["Chain-data", "resolution"],
		desc: "Markets resolve from Zcash blocks, so anyone can recompute the outcome.",
		wide: true,
	},
	{
		n: "05",
		art: "payout",
		tag: "Fresh address",
		title: ["Batched", "payouts"],
		desc: "One threshold-signed Ironwood transaction per epoch pays every winner.",
		wide: true,
	},
];
