// Mock relayer settings; override with env vars.
export const PORTS = (process.env.MOCK_PORTS ?? "4101,4102,4103").split(",").map(Number);
export const BATCH_MS = Number(process.env.MOCK_BATCH_MS ?? 5000);
export const BOT_MS = Number(process.env.MOCK_BOT_MS ?? 2000);
/** Judge mode credit: 25 units in half-ticks (1 unit = 200). */
export const JUDGE_CREDIT = 25n * 200n;
/** View items kept per relayer. */
export const VIEW_KEEP = 400;
/** A pending order whose three shares never all arrive is dropped after this many batches. */
export const SHARE_TIMEOUT_BATCHES = 2;
/** Roughly the mainnet tip today; the mock advances one block per batch. */
export const START_HEIGHT = 3_526_400;
/** Clearing prices kept per market for `history`. */
export const HISTORY_KEEP = 32;
/** Batches the bots trade at startup, so prices and history exist on first load. */
export const WARMUP_BATCHES = 24;

// Params follow packages/plugins/*; a market closes 100 blocks before it resolves.
const market = (id, question, plugin, params, resolveHeight) => ({
	id,
	question,
	plugin,
	params,
	closeHeight: resolveHeight - 100,
	resolveHeight,
	status: "open",
});

export const MARKETS = [
	market(
		1,
		"Will NU7 activate on mainnet at height 3,543,405?",
		"nu7-activation",
		{ activationHeight: 3_543_405 },
		3_543_405,
	),
	market(
		2,
		"Will the Ironwood pool hold at least 250,000 notes at height 3,560,000?",
		"ironwood-pool",
		{ minNotes: 250_000 },
		3_560_000,
	),
	market(
		3,
		"Will block 3,535,000 contain at least 100 shielded actions?",
		"shielded-actions",
		{ minActions: 100 },
		3_535_000,
	),
];
