// Units → ZEC formatting, the inline ZEC icon matching the brand file, average price, and
// the browser-side share XOR (node --test).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
	encodeOrder,
	FILL_LEN,
	HALF_TICKS_PER_UNIT,
	ORDER_LEN,
	split,
	toHex,
	UNIT_ZATS,
	unitsToZec,
	viewDigest,
} from "@zpredict/sdk";
import { avgCents, ORDER_FIELDS, units, zec } from "./format.ts";
import { digestsOf, openFill, openOrder, xorHex } from "./shares.ts";

test("1 unit = 200 half-ticks = 0.01 ZEC, exact", () => {
	assert.equal(zec(HALF_TICKS_PER_UNIT), "0.01");
	assert.equal(zec(25n * HALF_TICKS_PER_UNIT), "0.25");
	assert.equal(zec(5000), "0.25");
	assert.equal(zec(700), "0.035");
	assert.equal(zec(1), "0.00005");
	assert.equal(zec(0), "0.00");
	assert.equal(zec(10_000n * HALF_TICKS_PER_UNIT), "100.00");
	assert.equal(zec(-200), "-0.01");
	assert.equal(units(5000), "25.00");
});

test("agrees with the sdk's deposit amounts (UNIT_ZATS)", () => {
	for (const d of [1, 5, 25] as const) {
		assert.equal(Number(zec(BigInt(d) * HALF_TICKS_PER_UNIT)), Number(unitsToZec(d)));
		assert.equal(BigInt(d) * HALF_TICKS_PER_UNIT * 5_000n, BigInt(d) * UNIT_ZATS);
	}
});

test("the inline icon draws the same shapes as packages/brand/zec/zec.svg", () => {
	const svg = readFileSync(new URL("../../../packages/brand/zec/zec.svg", import.meta.url), "utf8");
	const src = readFileSync(new URL("../components/ui/ZecIcon.tsx", import.meta.url), "utf8");
	const path = svg.match(/<path[^>]* d="([^"]+)"/)?.[1];
	const fill = svg.match(/<circle[^>]* fill="([^"]+)"/)?.[1];
	assert.ok(path && fill);
	assert.ok(src.includes(`"${path}"`), "path differs");
	assert.ok(src.includes(`"${fill}"`), "fill differs");
});

test("average price: 3 contracts for 345 half-ticks is 57.5¢; no contracts, no division by zero", () => {
	assert.equal(avgCents({ size: 3, totalCost: 345, side: 0, filled: true }), 57.5);
	assert.equal(avgCents({ size: 0, totalCost: 0, side: 0, filled: false }), 0);
});

test("ORDER_FIELDS covers the whole order (#130)", () => {
	assert.equal(ORDER_FIELDS[0].from, 0);
	for (const [i, f] of ORDER_FIELDS.slice(1).entries()) assert.equal(f.from, ORDER_FIELDS[i].to);
	assert.equal(ORDER_FIELDS.at(-1)?.to, ORDER_LEN);
});

test("an order opens only once all three shares arrived", () => {
	const order = { market: 1, side: 0 as const, price: 60, size: 3, key: "2a".repeat(16) };
	const shares = split(encodeOrder(order)).map(toHex);
	assert.equal(xorHex([shares[0], shares[1]]), null);
	assert.equal(openOrder([shares[0], undefined as unknown as string, shares[2]]), null);
	assert.deepEqual(openOrder(shares), order);
	const fill = split(new Uint8Array(FILL_LEN)).map(toHex);
	assert.deepEqual(openFill(fill), { size: 0, totalCost: 0, side: 0, filled: false });
	// The browser finds its own rows in a relayer's view by the digests of what it sent.
	const mine = digestsOf([{ shares, fillShares: fill }, {}]);
	assert.equal(mine.size, 6);
	assert.ok(mine.has(viewDigest(Buffer.from(shares[1], "hex"))));
});
