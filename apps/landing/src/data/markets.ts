/**
 * The markets the hosted relayers serve: the markets in deploy/production/relayer.toml (same
 * ids, questions and heights; 11-13 mirror Polymarket) plus the hourly rolling series. No
 * prices here, ours or Polymarket's: the live ones are only in the app, so the landing can't
 * disagree and makes no request to anyone.
 */
export type Plugin = "nu7-activation" | "ironwood-pool" | "shielded-actions" | "polymarket";

export interface Market {
	/** Relayer market id; none for the rolling series, whose id changes every hour. */
	id?: number;
	plugin: Plugin;
	question: string;
	/** Block height the resolver reads, or a label for the rolling series and mirrored markets. */
	resolve: string;
}

export const categoryOf: Record<Plugin, string> = {
	"nu7-activation": "Network upgrade",
	"ironwood-pool": "Ironwood pool",
	"shielded-actions": "Shielded activity",
	polymarket: "Politics · mirrored",
};

/** How a market resolves, for the card footer. */
export const resolvedBy = (m: Market) =>
	m.plugin === "polymarket" ? "Resolves per Polymarket" : "Resolved from chain data";

export const markets: Market[] = [
	{
		id: 1,
		plugin: "nu7-activation",
		question: "Will NU7 activate on mainnet at block 3,543,405?",
		resolve: "Block 3,543,405",
	},
	{
		id: 2,
		plugin: "ironwood-pool",
		question: "Will the Ironwood pool hold ≥ 900,000 notes at block 3,560,000?",
		resolve: "Block 3,560,000",
	},
	{
		id: 11,
		plugin: "polymarket",
		question: "Will the Democratic Party control the House after the 2026 Midterm elections?",
		resolve: "US midterms, Nov 3",
	},
	{
		id: 12,
		plugin: "polymarket",
		question: "Will the Republican Party control the House after the 2026 Midterm elections?",
		resolve: "US midterms, Nov 3",
	},
	{
		id: 13,
		plugin: "polymarket",
		question: "Will the Democrats win the Texas Senate race in 2026?",
		resolve: "US midterms, Nov 3",
	},
	{
		plugin: "shielded-actions",
		question:
			"Every hour: will a mainnet block an hour ahead contain at least the recent median of shielded actions?",
		resolve: "Hourly",
	},
];
