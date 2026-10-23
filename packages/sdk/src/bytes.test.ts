import assert from "node:assert/strict";
import { test } from "node:test";
import { fromHex, toHex } from "./bytes.js";

test("regression #31: fromHex rejects odd and non-hex input in linear time", () => {
	assert.deepEqual(fromHex("00Ff"), Uint8Array.of(0, 255));
	assert.equal(toHex(fromHex("0a1b")), "0a1b");
	// A backtracking pattern takes minutes on these; one character class takes milliseconds.
	for (const bad of [`${"ab".repeat(2e6)}x`, `${"ab".repeat(2e6)}zz`, `zz${"ab".repeat(2e6)}`]) {
		const t0 = performance.now();
		assert.throws(() => fromHex(bad), SyntaxError);
		assert.ok(performance.now() - t0 < 1000, "linear");
	}
});
