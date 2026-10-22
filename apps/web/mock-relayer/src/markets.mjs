// The demo markets: same questions, heights and opening prices as the landing
// (apps/landing/src/data/markets.ts). Params follow packages/plugins/*. Every market
// resolves at a future mainnet height; a market closes 100 blocks before it resolves.

const market = (id, plugin, question, params, resolveHeight, fair) => ({
	id,
	question,
	plugin,
	params,
	closeHeight: resolveHeight - 100,
	resolveHeight,
	status: "open",
	/** Bot fair value in YES cents; not published. */
	fair,
});

export const MARKET_DEFS = [
	market(
		1,
		"nu7-activation",
		"Will NU7 activate on mainnet at block 3,543,405?",
		{ activationHeight: 3_543_405 },
		3_543_405,
		71,
	),
	market(
		2,
		"ironwood-pool",
		"Will the Ironwood pool hold ≥ 900,000 notes at block 3,560,000?",
		{ minNotes: 900_000 },
		3_560_000,
		38,
	),
	market(
		3,
		"shielded-actions",
		"Will block 3,550,000 contain at least 5 shielded actions?",
		{ minActions: 5 },
		3_550_000,
		54,
	),
	market(
		4,
		"ironwood-pool",
		"Will the Ironwood pool hold ≥ 1,000,000 notes at block 3,600,000?",
		{ minNotes: 1_000_000 },
		3_600_000,
		22,
	),
	market(
		5,
		"shielded-actions",
		"Will block 3,540,000 contain at least 1 shielded action?",
		{ minActions: 1 },
		3_540_000,
		86,
	),
	market(
		6,
		"shielded-actions",
		"Will block 3,570,000 contain at least 20 shielded actions?",
		{ minActions: 20 },
		3_570_000,
		9,
	),
];
