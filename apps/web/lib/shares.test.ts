import assert from "node:assert/strict";
import { test } from "node:test";
import { missed } from "./shares.ts";

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
