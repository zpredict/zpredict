// Portfolio holdings from this browser's own fills (node --test).
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Market } from "@zpredict/sdk";
import type { MyOrder } from "../hooks/useOrders.tsx";
import { positions } from "./portfolio.ts";

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
	assert.deepEqual(yes, { market: 11, side: 0, shares: 5, cost: 600, value: 700, hedged: false });
	assert.deepEqual(hedge, { market: 11, side: 1, shares: 5, cost: 400, value: 300, hedged: true });
});

test("resolved markets pay 1 unit per winning share; no price yet is unknown", () => {
	const orders = [order({ fill: fill(0, 2, 240) }), order({ market: 12, fill: fill(1, 1, 80) })];
	const ms = [market({ status: "resolved", outcome: "yes" }), market({ id: 12 })];
	const [won, unpriced] = positions(orders, ms);
	assert.equal(won.value, 400);
	assert.equal(unpriced.value, null);
	assert.equal(positions(orders, [market({ status: "resolved", outcome: "no" })])[0].value, 0);
});
