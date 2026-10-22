/**
 * Sample markets, one per real resolver plugin in packages/plugins.
 * Illustration only until the app is live: prices and history are made up.
 */
export type Plugin = "nu7-activation" | "ironwood-pool" | "shielded-actions";

export interface Market {
	id: string;
	plugin: Plugin;
	question: string;
	/** YES price in hundredths of one collateral unit (shown as ¢). */
	yes: number;
	/** Block height the resolver reads. */
	resolveHeight: number;
	/** Recent YES prices, oldest first, for the sparkline. */
	history: number[];
}

export const categoryOf: Record<Plugin, string> = {
	"nu7-activation": "Network upgrade",
	"ironwood-pool": "Ironwood pool",
	"shielded-actions": "Shielded activity",
};

export const markets: Market[] = [
	{
		id: "nu7-mainnet",
		plugin: "nu7-activation",
		question: "Will NU7 activate on mainnet at block 3,543,405?",
		yes: 71,
		resolveHeight: 3_543_405,
		history: [52, 55, 54, 58, 61, 60, 63, 66, 64, 68, 70, 71],
	},
	{
		id: "ironwood-900k",
		plugin: "ironwood-pool",
		question: "Will the Ironwood pool hold ≥ 900,000 notes at block 3,560,000?",
		yes: 38,
		resolveHeight: 3_560_000,
		history: [45, 44, 46, 42, 41, 43, 40, 39, 41, 37, 36, 38],
	},
	{
		id: "actions-5",
		plugin: "shielded-actions",
		question: "Will block 3,550,000 contain at least 5 shielded actions?",
		yes: 54,
		resolveHeight: 3_550_000,
		history: [48, 50, 47, 49, 52, 51, 50, 53, 55, 52, 53, 54],
	},
	{
		id: "ironwood-1m",
		plugin: "ironwood-pool",
		question: "Will the Ironwood pool hold ≥ 1,000,000 notes at block 3,600,000?",
		yes: 22,
		resolveHeight: 3_600_000,
		history: [30, 29, 27, 28, 26, 25, 27, 24, 23, 24, 21, 22],
	},
	{
		id: "actions-1",
		plugin: "shielded-actions",
		question: "Will block 3,540,000 contain at least 1 shielded action?",
		yes: 86,
		resolveHeight: 3_540_000,
		history: [74, 76, 75, 79, 80, 78, 82, 83, 81, 84, 85, 86],
	},
	{
		id: "actions-20",
		plugin: "shielded-actions",
		question: "Will block 3,570,000 contain at least 20 shielded actions?",
		yes: 9,
		resolveHeight: 3_570_000,
		history: [15, 14, 14, 12, 13, 11, 12, 10, 11, 9, 10, 9],
	},
];

/** The three cards stacked in the hero, back to front (the NU7 market on top). */
export const heroMarkets = markets.slice(0, 3).reverse();
