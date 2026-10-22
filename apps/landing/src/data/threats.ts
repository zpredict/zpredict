/** Rows of the DESIGN.md threat model. `{ em }` segments render in bold. */
export type Segment = string | { em: string };

export interface ThreatRow {
	observer: string;
	learns: Segment[];
	hidden: string;
}

export const thresholds = [
	{ value: "2-of-3", label: "to move funds (FROST)" },
	{ value: "3-of-3", label: "to read orders (MPC)" },
];

export const threats: ThreatRow[] = [
	{
		observer: "Chain observer",
		learns: ["The escrow exists and makes batched shielded transactions"],
		hidden: "Who bet, which side, how much, who won",
	},
	{
		observer: "Any single relayer",
		learns: ["“A 5-unit deposit arrived”"],
		hidden: "Orders, sides, prices, positions, deposit→payout links",
	},
	{
		observer: "2 colluding relayers",
		learns: ["Same as one for orders, and ", { em: "can move escrow funds" }, " (2-of-3)"],
		hidden: "Orders: MPC needs all 3 to collude",
	},
	{ observer: "All 3 colluding", learns: ["Everything"], hidden: "—" },
	{
		observer: "Counterparty",
		learns: ["That a fill happened at the midpoint"],
		hidden: "Who you are, your size beyond the fill",
	},
	{
		observer: "Network observer",
		learns: ["That someone talks to a zPredict relayer"],
		hidden: "Contents (TLS); your IP if you use Tor",
	},
];
