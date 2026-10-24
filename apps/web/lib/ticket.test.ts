// ZEC amount → whole shares, cost and payout on the order ticket (node --test).
import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_SIZE } from "@zpredict/sdk";
import { zec } from "./format.ts";
import { quote, zecToHalfTicks } from "./ticket.ts";

test("0.05 ZEC at 60¢ buys 8 shares for 0.048 ZEC and wins 0.08 ZEC", () => {
	const q = quote(0.05, 60);
	assert.deepEqual(q, { each: 120, shares: 8, cost: 960, payout: 1600 });
	assert.equal(zec(q.each), "0.006");
	assert.equal(zec(q.cost), "0.048");
	assert.equal(zec(q.payout), "0.08");
});

test("cost is rounded down to whole shares, never above the amount", () => {
	for (const price of [1, 7, 33, 50, 99])
		for (const amount of [0.0001, 0.01, 0.0137, 0.25, 1.23456789]) {
			const q = quote(amount, price);
			assert.ok(q.cost <= zecToHalfTicks(amount));
			assert.ok(zecToHalfTicks(amount) - q.cost < q.each);
		}
});

test("less than one share, empty or bad input buys nothing", () => {
	assert.equal(quote(0.005, 60).shares, 0);
	assert.equal(quote(0.006, 60).shares, 1);
	assert.equal(quote(Number.NaN, 60).shares, 0);
	assert.equal(quote(-1, 60).shares, 0);
});

test("ZEC → half-ticks is exact for decimal input and capped at MAX_SIZE shares", () => {
	assert.equal(zecToHalfTicks(0.01), 200);
	assert.equal(zecToHalfTicks(0.29), 5800); // 0.29 * 1e8 is 28999999.999999996 in floats
	assert.equal(zecToHalfTicks(0.00004), 0);
	assert.equal(quote(1e6, 1).shares, MAX_SIZE);
});
