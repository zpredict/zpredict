// The demo markets: the configured markets of deploy/production/relayer.toml (shown on
// the landing; ids 11-13 mirror Polymarket) plus three extra chain markets, with mock
// opening prices. Params follow
// packages/plugins/*. Every market resolves at a future mainnet height; a market closes 100
// blocks before it resolves.

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

const HOUSE = { id: "house-2026", title: "Which party will win the House in 2026?" };

/**
 * A mirrored Polymarket market (packages/plugins/polymarket) with a mock reference: the
 * real relayers fetch it from Polymarket, the browser never does. Closes at block 3,540,470.
 */
const mirror = (id, question, conditionId, slug, price, event) => {
	const now = Math.floor(Date.now() / 1000);
	const history = Array.from({ length: 48 }, (_, i) => ({
		t: now - (47 - i) * 3600,
		price: Math.round((price + Math.sin(i / 5) * 3) * 10) / 10,
	}));
	return {
		...market(id, "polymarket", question, { conditionId, slug }, 3_540_470, Math.round(price)),
		closeHeight: 3_540_470,
		category: "Politics",
		...(event && { event }),
		rules: "Mirrors the Polymarket market of the same question; YES iff Polymarket settles it Yes.",
		reference: {
			source: "polymarket",
			price,
			url: `https://polymarket.com/market/${slug}`,
			history,
		},
	};
};

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
	mirror(
		11,
		"Will the Democratic Party control the House after the 2026 Midterm elections?",
		"0xd5d9fc47718bd553592d126b1fa5e87183d27f3936975b0c04cc0f2dec1f1bb4",
		"will-the-democratic-party-control-the-house-after-the-2026-midterm-elections",
		92.5,
		HOUSE,
	),
	mirror(
		12,
		"Will the Republican Party control the House after the 2026 Midterm elections?",
		"0x4e4f77e7dbf4cab666e9a1943674d7ae66348e862df03ea6f44b11eb95731928",
		"will-the-republican-party-control-the-house-after-the-2026-midterm-elections",
		7.5,
		HOUSE,
	),
	mirror(
		13,
		"Will the Democrats win the Texas Senate race in 2026?",
		"0x34918035a590555ba1fb1d6a019d766ab6e557d63e7f3140b63b4550eee7f417",
		"will-the-democrats-win-the-texas-senate-race-in-2026",
		66.5,
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
