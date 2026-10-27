// Portfolio holdings from this browser's own fills (node --test).
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Market } from "@zpredict/sdk";
import type { MyOrder } from "../hooks/useOrders.tsx";
import { pnlSeries, positions } from "./portfolio.ts";

const order = (o: Partial<MyOrder>): MyOrder =>
	({
		orderId: "x",
		batch: 1,
		at: 0,
		status: "filled",
		market: 11,
		side: 0,
		price: 60,
		size: 2,
		...o,
	}) as MyOrder;
const fill = (side: 0 | 1, size: number, totalCost: number) => ({
	size,
	totalCost,
	side,
	filled: true,
});
const market = (m: Partial<Market>) => ({ id: 11, status: "open", ...m }) as Market;

test("holdings sum fills per market and side, valued at the last price", () => {
	const orders = [
		order({ fill: fill(0, 2, 240) }),
		order({ fill: fill(0, 3, 360) }),
		order({ status: "unfilled" }),
		order({ counterOf: "x", side: 1, fill: fill(1, 5, 400) }),
	];
	const [yes, hedge] = positions(orders, [market({ lastPrice: 70 })]);
	assert.deepEqual(yes, {
		market: 11,
		side: 0,
		shares: 5,
		cost: 600,
		value: 700,
		hedged: false,
		settled: false,
	});
	assert.deepEqual(hedge, {
		market: 11,
		side: 1,
		shares: 5,
		cost: 400,
		value: 300,
		hedged: true,
		settled: false,
	});
});

test("resolved markets pay 1 unit per winning share; no price yet is unknown", () => {
	const orders = [order({ fill: fill(0, 2, 240) }), order({ market: 12, fill: fill(1, 1, 80) })];
	const ms = [market({ status: "resolved", outcome: "yes" }), market({ id: 12 })];
	const [won, unpriced] = positions(orders, ms);
	assert.equal(won.value, 400);
	assert.equal(won.settled, true);
	assert.equal(unpriced.settled, false);
	assert.equal(unpriced.value, null);
	assert.equal(positions(orders, [market({ status: "resolved", outcome: "no" })])[0].value, 0);
});

test("P&L over time follows the public price after each fill; self-trade legs are left out", () => {
	const orders = [
		order({ at: 1000_000, fill: fill(0, 2, 200) }), // 2 YES at 50¢, t = 1000
		order({ at: 1000_000, counterOf: "x", side: 1, fill: fill(1, 2, 200) }),
	];
	const m = market({ history: [50, 60, 40], historyAt: [900, 1500, 2000] });
	const s = pnlSeries(orders, [m], 3000);
	assert.deepEqual(s, [
		{ t: 1000, v: 0 },
		{ t: 1500, v: 40 },
		{ t: 2000, v: -40 },
		{ t: 3000, v: -40 },
	]);
	assert.deepEqual(pnlSeries([], [m], 3000), []);
	const won = pnlSeries(orders.slice(0, 1), [market({ status: "resolved", outcome: "yes" })], 3000);
	assert.equal(won.at(-1)?.v, 200);
});

test("a NO fill with no public price yet starts at zero P&L", () => {
	const orders = [order({ at: 1000_000, side: 1, fill: fill(1, 10, 600) })]; // 10 NO at 30¢
	assert.deepEqual(pnlSeries(orders, [market({})], 2000), [
		{ t: 1000, v: 0 },
		{ t: 2000, v: 0 },
	]);
});

test("a market gone from a loaded list counts as settled", () => {
	const [gone] = positions([order({ market: 99, fill: fill(0, 1, 100) })], [market({})]);
	assert.equal(gone.settled, true);
	assert.equal(gone.value, null);
});
