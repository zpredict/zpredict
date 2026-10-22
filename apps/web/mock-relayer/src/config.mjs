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
export const START_HEIGHT = 3_526_450;
/** Clearing prices kept per market for `history`. */
export const HISTORY_KEEP = 32;
/** Batches the bots trade at startup, so prices and history exist on first load. */
export const WARMUP_BATCHES = 24;
