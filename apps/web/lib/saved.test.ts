// Saved markets and the compact volume label (node --test).
import assert from "node:assert/strict";
import { test } from "node:test";
import { usdCompact } from "./format.ts";
import { toggleKey } from "./saved.ts";

test("saving adds a key in front; saving it again removes it", () => {
	const once = toggleKey(["m1"], "e7");
	assert.deepEqual(once, ["e7", "m1"]);
	assert.deepEqual(toggleKey(once, "e7"), ["m1"]);
	assert.deepEqual(toggleKey([], "m2"), ["m2"]);
});

test("volume reads in a few characters", () => {
	assert.equal(usdCompact(2_325_412.55), "$2.3M");
	assert.equal(usdCompact(950), "$950");
	assert.equal(usdCompact(1_200_000_000), "$1.2B");
});
