import assert from "node:assert/strict";
import { test } from "node:test";
import { cellForCssPx, designScale } from "./view.js";

test("cellForCssPx inverts the engine's cell sizing", () => {
	for (const [w, h] of [
		[1440, 900],
		[1600, 1000],
		[900, 700],
		[390, 844],
	]) {
		const cell = cellForCssPx(8, w, h);
		const shrink = w <= 900 ? Math.min(1, 450 / w) : 1;
		assert.ok(Math.abs(cell * shrink * designScale(w, h) - 8) < 1e-9, `${w}x${h}`);
	}
});
