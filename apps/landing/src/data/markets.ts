/**
 * The markets the hosted relayers serve: the three headline markets in
 * deploy/production/relayer.toml (same ids, questions and heights) plus the hourly rolling
 * series. No prices here: the live price is only in the app, so the landing can't disagree.
 */
export type Plugin = "nu7-activation" | "ironwood-pool" | "shielded-actions";

export interface Market {
	/** Relayer market id; none for the rolling series, whose id changes every hour. */
	id?: number;
	plugin: Plugin;
	question: string;
	/** Block height the resolver reads, or a label for the rolling series. */
	resolve: string;
}

export const categoryOf: Record<Plugin, string> = {
	"nu7-activation": "Network upgrade",
	"ironwood-pool": "Ironwood pool",
	"shielded-actions": "Shielded activity",
};

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
		id: 3,
		plugin: "shielded-actions",
		question: "Will block 3,550,000 contain at least 5 shielded actions?",
		resolve: "Block 3,550,000",
	},
	{
		plugin: "shielded-actions",
		question:
			"Every hour: will a mainnet block an hour ahead contain at least the recent median of shielded actions?",
		resolve: "Hourly",
	},
];
