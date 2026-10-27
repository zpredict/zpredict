import assert from "node:assert/strict";
import { test } from "node:test";
import { keepOrders, mergeOrders, missed } from "./shares.ts";

const fill = (filled: boolean) => ({
	size: filled ? 3 : 0,
	totalCost: 0,
	side: 0 as const,
	filled,
});

test("regression #136: a batched miss (filled, flag 0) and an expired order are both misses", () => {
	assert.equal(missed({ status: "filled", fill: fill(false) }), true, "what real relayers answer");
	assert.equal(missed({ status: "unfilled" }), true, "expired before batching");
	assert.equal(missed({ status: "filled", fill: fill(true) }), false);
	assert.equal(missed({ status: "pending" }), false);
});

test("regression: live positions are never trimmed, only history past `keep`", () => {
	const filled = {
		status: "filled",
		fill: { filled: true, size: 1, totalCost: 100, side: 0 as const },
	};
	const missedOne = { status: "unfilled" };
	const all = [missedOne, filled, missedOne, { status: "pending" }, missedOne, filled];
	const kept = keepOrders(all, 1);
	assert.equal(kept.length, 4, "two filled, one pending, one history");
	assert.equal(kept.filter((o) => o.status === "unfilled").length, 1);
	assert.equal(keepOrders(Array(60).fill(filled), 50).length, 60, "26+ pairs stay");
});

test("regression: a save keeps orders another tab stored meanwhile", () => {
	const mine = [{ orderId: "b", at: 2, status: "filled" }];
	const stored = [
		{ orderId: "c", at: 3, status: "pending" },
		{ orderId: "b", at: 2, status: "pending" },
		{ orderId: "a", at: 1, status: "unfilled" },
	];
	const merged = mergeOrders(mine, stored);
	assert.deepEqual(
		merged.map((o) => o.orderId),
		["c", "b", "a"],
	);
	assert.equal(merged[1].status, "filled", "this tab's copy wins");
});
