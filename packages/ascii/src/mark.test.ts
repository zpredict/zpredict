import assert from "node:assert/strict";
import { test } from "node:test";
import { inside, markPolygons, signedArea } from "./mark.js";
import { asciiSnapshot } from "./snapshot.js";

test("mark: two slabs, the lower one the upper turned 180°", () => {
	const [upper, lower] = markPolygons();
	assert.equal(upper.length, lower.length);
	upper.forEach(([x, y], i) => {
		assert.ok(Math.abs(x + lower[i][0]) < 1e-12 && Math.abs(y + lower[i][1]) < 1e-12);
	});
	assert.ok(Math.abs(signedArea(upper) - signedArea(lower)) < 1e-12);
});

test("mark: fits the unit square, slabs match the logo", () => {
	const [upper, lower] = markPolygons();
	for (const [x, y] of [...upper, ...lower]) assert.ok(Math.abs(x) <= 1 && Math.abs(y) <= 1);
	// Solid in the middle of each slab, empty between them and inside each notch.
	assert.ok(inside(upper, -0.3, 0.6));
	assert.ok(inside(lower, 0.3, -0.6));
	assert.ok(!inside(upper, -0.3, 0) && !inside(lower, -0.3, 0));
	assert.ok(!inside(upper, 0.5, 0.15));
	// Area of a slab is close to its traced bitmap (≈ 0.6 of the unit half-square).
	const area = Math.abs(signedArea(upper));
	assert.ok(area > 1.35 && area < 1.6, `area ${area}`);
});

test("snapshot: deterministic block of glyphs from the atlas", () => {
	const a = asciiSnapshot({ cols: 60, rows: 40 });
	assert.equal(a, asciiSnapshot({ cols: 60, rows: 40 }));
	const lines = a.split("\n");
	assert.equal(lines.length, 40);
	assert.ok(lines.every((l) => l.length <= 60));
	assert.match(a, /^[ .:\-=+*#%@0ONMWBX\n]+$/);
	const filled = a.replace(/[\s]/g, "").length;
	assert.ok(filled > 300, `only ${filled} glyphs`);
});
