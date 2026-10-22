/** Sample markets for the teaser. Prices are illustrative, not live. */
export interface SampleMarket {
	question: string;
	rule: string;
	/** YES price in percent of one unit. */
	yes: number;
}

export const sampleMarkets: SampleMarket[] = [
	{
		question: "Will NU7 activate on mainnet at height 3,543,405?",
		rule: "Activation height of the block header",
		yes: 71,
	},
	{
		question: "Will the Ironwood pool hold more than 500,000 ZEC at height 3,600,000?",
		rule: "Pool value from the chain",
		yes: 38,
	},
	{
		question: "Will block 3,560,000 contain more than 40 shielded actions?",
		rule: "Action count in that block",
		yes: 54,
	},
];
