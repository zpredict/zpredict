// The demo markets: the configured markets of deploy/production/relayer.toml (the two Zcash
// markets, and the mirrored Polymarket markets from catalog.json, which
// scripts/polymarket-catalog.mjs writes with the same entries) plus three extra chain
// markets, with mock opening prices. Params follow packages/plugins/*. A chain market
// closes 100 blocks before it resolves.
import { readFileSync } from "node:fs";

const CATALOG = JSON.parse(readFileSync(new URL("./catalog.json", import.meta.url), "utf8"));

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

/**
 * A mirrored Polymarket market (packages/plugins/polymarket) with a mock reference around
 * its catalog price: the real relayers fetch it from Polymarket, the browser never does.
 */
const mirror = (c) => {
	const now = Math.floor(Date.now() / 1000);
	const history = Array.from({ length: 48 }, (_, i) => ({
		t: now - (47 - i) * 3600,
		price: Math.min(99.9, Math.max(0.1, Math.round((c.price + Math.sin(i / 5) * 3) * 10) / 10)),
	}));
	return {
		...market(
			c.id,
			"polymarket",
			c.question,
			{ conditionId: c.conditionId, slug: c.slug },
			c.closeHeight,
			Math.round(c.price),
		),
		closeHeight: c.closeHeight,
		category: c.category,
		...(c.event && { event: c.event }),
		rules: c.rules,
		reference: {
			source: "polymarket",
			price: c.price,
			url: `https://polymarket.com/market/${c.slug}`,
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
	...CATALOG.map(mirror),
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
