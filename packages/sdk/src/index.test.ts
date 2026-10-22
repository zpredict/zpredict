import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
	combine,
	decodeBalance,
	decodeFill,
	decodeOrder,
	encodeOrder,
	fromHex,
	getFill,
	type Order,
	RELAYERS,
	split,
	submitOrder,
	tagAccount,
	toHex,
} from "./index.js";

// Written by `cargo test -p zpredict-core --test vectors`.
const v = JSON.parse(
	readFileSync(new URL("../../core/testdata/vectors.json", import.meta.url), "utf8"),
);

type Row = Omit<Order, "account"> & { account: string; hex: string };
const order = (r: Row): Order => ({
	market: r.market,
	side: r.side,
	price: r.price,
	size: r.size,
	account: BigInt(r.account),
});

test("orders encode and decode exactly like core", () => {
	for (const r of [...v.orders, ...v.batch] as Row[]) {
		assert.equal(toHex(encodeOrder(order(r))), r.hex);
		assert.deepEqual(decodeOrder(fromHex(r.hex)), order(r));
	}
});

test("split with fixed randomness matches core; combine rebuilds", () => {
	const s = v.split;
	const shares = split(fromHex(s.order), fromHex(s.r0), fromHex(s.r1));
	assert.deepEqual(shares.map(toHex), s.shares);
	assert.equal(toHex(combine(s.shares.map(fromHex))), s.order);
});

test("random split: three fresh shares, none equal to the order", () => {
	const b = fromHex(v.split.order);
	const shares = split(b);
	assert.deepEqual(combine(shares), b);
	for (const s of shares) assert.notEqual(toHex(s), v.split.order);
	assert.notDeepEqual(split(b)[0], shares[0]);
});

test("fill records decode the clear() output", () => {
	const want = [
		{ size: 3, totalCost: 315, side: 0, filled: true },
		{ size: 2, totalCost: 240, side: 0, filled: true },
		{ size: 5, totalCost: 445, side: 1, filled: true }, // two matches, two midpoints
		{ size: 0, totalCost: 0, side: 0, filled: false }, // dummy
	];
	assert.deepEqual(
		v.records.map((r: string) => decodeFill(fromHex(r))),
		want,
	);
});

test("fromHex rejects odd length and non-hex", () => {
	assert.deepEqual(fromHex("00ff"), Uint8Array.of(0, 255));
	assert.deepEqual(fromHex(""), new Uint8Array());
	for (const bad of ["0", "abc", "zz", "0g", `${"ab".repeat(5000)}x`]) {
		assert.throws(() => fromHex(bad), SyntaxError);
	}
});

test("rejects malformed orders", () => {
	const b = fromHex(v.orders[0].hex);
	assert.equal(decodeOrder(b.map((x, i) => (i === 4 ? 2 : x))), null);
	assert.equal(decodeOrder(b.map((x, i) => (i === 5 ? 100 : x))), null);
	assert.equal(decodeOrder(b.map((x, i) => (i === 5 ? 0 : x))), null);
	const ok = order(v.orders[0]);
	for (const bad of [
		{ price: 0 },
		{ price: 100 },
		{ size: 2 ** 32 },
		{ market: -1 },
		{ account: 1n << 64n },
	]) {
		assert.throws(() => encodeOrder({ ...ok, ...bad }), RangeError);
	}
});

test("balance and tag", () => {
	assert.equal(decodeBalance(fromHex("c800000000000000")), 200n);
	assert.equal(tagAccount(`2a${"00".repeat(15)}`), 42n);
	assert.throws(() => tagAccount("2a"), RangeError);
});

test("submitOrder sends exactly one share to each relayer", async (t) => {
	const posts: [string, { orderId: string; share: string }][] = [];
	t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
		assert.equal(init.credentials, "omit");
		posts.push([url, JSON.parse(init.body as string)]);
		return Response.json({ batch: 3 + posts.length }, { status: 202 });
	});
	const o = order(v.orders[0]);
	const { orderId, batch } = await submitOrder(RELAYERS, o);
	assert.match(orderId, /^[0-9a-f]{32}$/);
	assert.equal(batch, 6);
	assert.deepEqual(
		posts.map(([u]) => u),
		RELAYERS.map((r) => `${r}/orders`),
	);
	assert.ok(posts.every(([, b]) => b.orderId === orderId));
	const shares = posts.map(([, b]) => fromHex(b.share));
	assert.deepEqual(decodeOrder(combine(shares)), o);
});

test("refuses two relayers on one origin", async (t) => {
	const fetch = t.mock.method(globalThis, "fetch", async () => {
		throw new Error("must not fetch");
	});
	const same = [RELAYERS[0], RELAYERS[1], `${RELAYERS[0]}/x`] as const;
	await assert.rejects(submitOrder(same, order(v.orders[0])), /distinct/);
	await assert.rejects(getFill(same, "00"), /distinct/);
	assert.equal(fetch.mock.callCount(), 0);
});

test("getFill combines the three fill shares", async (t) => {
	const shares = split(fromHex(v.records[2]));
	t.mock.method(globalThis, "fetch", async (url: string) =>
		Response.json({
			status: "filled",
			fillShare: toHex(shares[RELAYERS.findIndex((r) => url.startsWith(r))]),
		}),
	);
	assert.deepEqual(await getFill(RELAYERS, "ab".repeat(16)), {
		status: "filled",
		fill: { size: 5, totalCost: 445, side: 1, filled: true },
	});
});
