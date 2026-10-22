// Mock relayer settings; override with env vars.
export const PORTS = (process.env.MOCK_PORTS ?? "4101,4102,4103")
	.split(",")
	.map(Number);
export const BATCH_MS = Number(process.env.MOCK_BATCH_MS ?? 5000);
export const BOT_MS = Number(process.env.MOCK_BOT_MS ?? 900);
/** Judge mode credit: 25 units in half-ticks (1 unit = 200). */
export const JUDGE_CREDIT = 25n * 200n;
/** View items kept per relayer. */
export const VIEW_KEEP = 400;
/** A pending order whose three shares never all arrive is dropped after this many batches. */
export const SHARE_TIMEOUT_BATCHES = 2;
export const START_HEIGHT = 3_128_400;

export const MARKETS = [
	{
		id: 1,
		question: "Will NU7 activate on mainnet by height 3,200,000?",
		plugin: "nu7-activation",
		params: { activationHeight: 3_200_000 },
	},
	{
		id: 2,
		question:
			"Will the Ironwood pool hold more than 500,000 ZEC at height 3,140,000?",
		plugin: "ironwood-pool",
		params: { thresholdZec: 500_000, atHeight: 3_140_000 },
	},
	{
		id: 3,
		question: "Will block 3,135,000 contain more than 40 shielded actions?",
		plugin: "shielded-actions",
		params: { height: 3_135_000, minActions: 40 },
	},
].map((m) => ({
	...m,
	closeHeight: START_HEIGHT + 4000,
	resolveHeight: START_HEIGHT + 4100,
	status: "open",
}));
