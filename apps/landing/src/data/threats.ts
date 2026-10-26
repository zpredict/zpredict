/** Rows of PRIVACY.md "Who learns what"; change both together. `{ em }` segments are highlighted. */
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
		learns: ["That shielded Ironwood transactions happen"],
		hidden: "Which ones are the escrow's, who bet, which side, how much, who won",
	},
	{
		observer: "Network observer",
		learns: ["That your IP talks to *.zpredict.site, and when"],
		hidden: "Contents (TLS); your IP if you use Tor",
	},
	{
		observer: "VM operator (demo)",
		learns: [{ em: "Everything" }, ": all three relayers run on one VM in this demo"],
		hidden: "—",
	},
	{
		observer: "One relayer",
		learns: [
			"Deposit amounts, times and account ids; withdrawal amounts, addresses and times; its own share of each order",
		],
		hidden: "Orders, sides, prices, sizes, positions, balances, your account tag",
	},
	{
		observer: "2 colluding relayers",
		learns: ["As one, and they ", { em: "can move escrow funds" }, " (2-of-3)"],
		hidden: "Orders: the third share is missing",
	},
	{ observer: "All 3 relayers", learns: ["Everything"], hidden: "—" },
	{
		observer: "Counterparty",
		learns: ["Its own fill at the midpoint"],
		hidden: "Who you are, your size beyond the fill",
	},
];
