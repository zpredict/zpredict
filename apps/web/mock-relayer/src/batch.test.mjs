// The mock's batch keeps the public contract the app reads: one historyAt per history entry.
import assert from "node:assert/strict";
import test from "node:test";
import { runBatch } from "./batch.mjs";
import { botOrders } from "./bots.mjs";
import { HISTORY_KEEP } from "./config.mjs";
import { markets } from "./state.mjs";

test("regression #122: historyAt has one time per history price, also once history is capped", () => {
	for (let b = 0; b < HISTORY_KEEP + 8; b++) {
		botOrders();
		runBatch(1_700_000_000_000 + b * 1000);
	}
	const priced = markets.filter((m) => m.history);
	assert.ok(priced.length > 0);
	for (const m of priced) {
		assert.equal(m.historyAt.length, m.history.length, `market ${m.id}`);
		assert.ok(m.history.length <= HISTORY_KEEP);
		assert.ok(
			m.historyAt.every((t, i) => i === 0 || t >= m.historyAt[i - 1]),
			"oldest first",
		);
		assert.equal(m.lastPrice, m.history.at(-1));
	}
});
