// In-app notifications from this browser's own state (node --test).
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Market } from "@zpredict/sdk";
import type { MyOrder } from "../hooks/useOrders.tsx";
import { detect, EMPTY, readAll } from "./notify.ts";
import { positions } from "./portfolio.ts";

const market = (m: Partial<Market> = {}) =>
	({ id: 11, question: "Will it rain?", status: "open", ...m }) as Market;
const order = (o: Partial<MyOrder>) =>
	({
		orderId: "a",
		batch: 1,
		at: 0,
		status: "pending",
		market: 11,
		side: 0,
		price: 60,
		size: 2,
		...o,
	}) as MyOrder;
const filled = (o: Partial<MyOrder> = {}) =>
	order({ status: "filled", fill: { filled: true, size: 2, totalCost: 240, side: 0 }, ...o });
const state = (orders: MyOrder[], markets: Market[], balance: bigint, now = 1) => ({
	orders,
	markets,
	held: positions(orders, markets),
	balance,
	now,
});

test("the first check is a baseline: past events never flood the inbox", () => {
	const { inbox, fresh } = detect(EMPTY, state([filled()], [market()], 1000n));
	assert.deepEqual(fresh, []);
	assert.deepEqual(inbox.seen, ["order:a"]);
	assert.equal(inbox.balance, "1000");
});

test("a fill notifies once; the self-trade leg and pending orders say nothing", () => {
	let { inbox } = detect(EMPTY, state([], [market()], 1000n));
	const orders = [filled(), filled({ orderId: "b", counterOf: "a" }), order({ orderId: "c" })];
	const r = detect(inbox, state(orders, [market()], 1000n, 2));
	assert.deepEqual(
		r.fresh.map((n) => [n.title, n.body]),
		[["Order filled", "2 YES at 60.0¢ · Will it rain?"]],
	);
	inbox = r.inbox;
	const again = detect(inbox, state(orders, [market()], 1000n, 3));
	assert.equal(again.inbox, inbox, "nothing new: same object");
	assert.deepEqual(again.fresh, []);
});

test("a missed order says nothing was spent", () => {
	const { inbox } = detect(EMPTY, state([], [market()], 1000n));
	const miss = order({ status: "unfilled" });
	const r = detect(inbox, state([miss], [market()], 1000n, 2));
	assert.equal(r.fresh[0].title, "Order not filled");
});

test("a resolution with a winning position notifies, and its payout is not a second credit", () => {
	const orders = [filled()];
	const { inbox } = detect(EMPTY, state(orders, [market()], 1000n));
	const done = market({ status: "resolved", outcome: "yes" });
	const r = detect(inbox, state(orders, [done], 1400n, 2));
	assert.deepEqual(
		r.fresh.map((n) => [n.title, n.body]),
		[["Resolved YES", "Your YES shares pay 0.02 ZEC · Will it rain?"]],
	);
});

test("a balance rise alone is a credit; a fall is silent; read marks", () => {
	const { inbox } = detect(EMPTY, state([], [market()], 1000n));
	const r = detect(inbox, state([], [market()], 2000n, 2));
	assert.deepEqual(
		r.fresh.map((n) => [n.title, n.body]),
		[["Funds credited", "+0.05 ZEC in your balance"]],
	);
	const fall = detect(r.inbox, state([], [market()], 1500n, 3));
	assert.deepEqual(fall.fresh, []);
	assert.equal(fall.inbox.balance, "1500");
	const read = readAll(fall.inbox);
	assert.ok(read.notes.every((n) => n.read));
	assert.equal(readAll(read), read);
});
