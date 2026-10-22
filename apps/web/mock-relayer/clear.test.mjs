// The port must agree with zpredict-core: same cases as its unit tests, plus the pinned vectors.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { decodeOrder, fromHex } from "@zpredict/sdk";
import { clear, TICKS } from "./clear.mjs";

const o = (side, price, size) => ({
	market: 7,
	side,
	price,
	size,
	account: 42n,
});

test("crosses at midpoint", () => {
	assert.deepEqual(clear([o(0, 60, 3), o(1, 45, 3)]), [
		{ yes: 0, no: 1, size: 3, yesCost: 115, noCost: 85 },
	]);
});

test("no cross below one unit", () => {
	assert.deepEqual(clear([o(0, 40, 1), o(1, 59, 1)]), []);
});

test("best price first, partial fills, dummies", () => {
	const f = clear([o(0, 55, 4), o(0, 70, 2), o(1, 50, 5), o(1, 99, 0)]);
	assert.equal(f.length, 2);
	assert.deepEqual([f[0].yes, f[0].size], [1, 2]);
	assert.deepEqual([f[1].yes, f[1].size], [0, 3]);
	assert.ok(f.every((x) => x.yesCost + x.noCost === 2 * TICKS));
});

test("matches core test vectors", () => {
	const v = JSON.parse(
		readFileSync(
			new URL("../../../packages/core/testdata/vectors.json", import.meta.url),
			"utf8",
		),
	);
	const fills = clear(v.batch.map((x) => decodeOrder(fromHex(x.hex))));
	assert.deepEqual(
		fills,
		v.fills.map(({ yes, no, size, yesCost, noCost }) => ({
			yes,
			no,
			size,
			yesCost,
			noCost,
		})),
	);
});
