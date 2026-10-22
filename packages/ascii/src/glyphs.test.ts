import assert from "node:assert/strict";
import { test } from "node:test";
import {
	ALPHABET,
	cellDensity,
	cellHash,
	cellLight,
	flickerPhase,
	flickerTile,
	glyphTile,
	hasGlyph,
	TILE_H,
	TILE_W,
	tileU,
} from "./glyphs.js";
import { designScale, frustum } from "./view.js";

const N = ALPHABET.length;

test("atlas: 16 glyphs, light to dense, 12×16 tiles", () => {
	assert.equal(ALPHABET, ".:-=+*#%@0ONMWBX");
	assert.equal(N, 16);
	assert.equal(new Set(ALPHABET).size, N);
	assert.deepEqual([TILE_W, TILE_H], [12, 16]);
});

test("glyphTile maps density onto the 16 tiles and clamps", () => {
	assert.equal(glyphTile(0), 0);
	assert.equal(glyphTile(0.0624), 0);
	assert.equal(glyphTile(0.0625), 1);
	assert.equal(glyphTile(0.5), 8);
	assert.equal(glyphTile(1), N - 1);
	assert.equal(glyphTile(-3), 0);
	assert.equal(glyphTile(7), N - 1);
});

test("flicker moves a tile by -1, 0, +1, 0 and reflects at both ends", () => {
	assert.deepEqual(
		[0, 1, 2, 3].map((p) => flickerTile(5, p)),
		[4, 5, 6, 5],
	);
	assert.equal(flickerTile(0, 0), 1);
	assert.equal(flickerTile(N - 1, 2), N - 2);
	for (let tile = 0; tile < N; tile++) {
		for (let p = 0; p < 4; p++) {
			const t = flickerTile(tile, p);
			assert.ok(t >= 0 && t < N && Math.abs(t - tile) <= 1);
		}
	}
});

test("tile u range stays inside its tile", () => {
	for (let tile = 0; tile < N; tile++) {
		const [u0, u1] = tileU(tile);
		assert.ok(u0 > tile / N && u1 < (tile + 1) / N);
	}
});

test("cell hash and flicker phase are deterministic and in range", () => {
	for (let i = -20; i < 20; i++) {
		const h = cellHash(i, i * 3);
		assert.ok(h >= 0 && h < 1);
		assert.equal(h, cellHash(i, i * 3));
		const p = flickerPhase(12.5, i, -i);
		assert.ok(Number.isInteger(p) && p >= 0 && p < 4);
	}
});

test("light: contrast 2.15 around mid grey; empty threshold and edges", () => {
	assert.equal(cellLight(0.5, 0), 0.5);
	assert.equal(cellLight(0.22, 0), 0);
	assert.equal(cellLight(0.78, 0), 1);
	assert.ok(Math.abs(cellLight(0.6, 0) - 0.715) < 1e-9);
	assert.equal(hasGlyph(0.11, 0), false);
	assert.equal(hasGlyph(0.12, 0), true);
	assert.equal(hasGlyph(0, 1), true);
	assert.equal(cellDensity(0, 1), 0.28);
	assert.equal(cellDensity(1, 0), 1);
});

test("design scale: 1600×1000 artboard, 900 logical px on small screens", () => {
	assert.equal(designScale(1600, 1000), 1);
	assert.equal(designScale(1440, 900), 0.9);
	assert.equal(designScale(3200, 1000), 1);
	assert.equal(designScale(450, 900), 0.5);
});

test("frustum keeps the framing square at the requested size and place", () => {
	const f = frustum(1600, 1000, { size: 0.5, x: 0.5, y: 0.5 });
	assert.ok(Math.abs(f.right - f.left - (1600 / 500) * 0.78) < 1e-9);
	assert.ok(Math.abs(f.left + f.right) < 1e-9 && Math.abs(f.top + f.bottom) < 1e-9);
});
