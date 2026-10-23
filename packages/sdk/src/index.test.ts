import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
	accountHex,
	claimJudge,
	combine,
	counterOrder,
	decodeBalance,
	decodeFill,
	decodeOrder,
	encodeOrder,
	fromHex,
	getAccount,
	getBalance,
	getFill,
	keyShares,
	type Order,
	payoutZats,
	RELAYERS,
	split,
	submitOrder,
	submitWithCounterparty,
	submitWithdrawal,
	TableFullError,
	toHex,
	viewDigest,
} from "./index.js";

// Written by `cargo test -p zpredict-core --test vectors`.
const v = JSON.parse(
	readFileSync(new URL("../../core/testdata/vectors.json", import.meta.url), "utf8"),
);

type Row = Order & { hex: string };
const order = (r: Row): Order => ({
	market: r.market,
	side: r.side,
	price: r.price,
	size: r.size,
	key: r.key,
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
		{ key: "00" },
		{ key: "AB".repeat(16) },
	]) {
		assert.throws(() => encodeOrder({ ...ok, ...bad }), RangeError);
	}
});

test("balances: each relayer is asked with its own key share only", async (t) => {
	assert.equal(decodeBalance(fromHex("c800000000000000")), 200n);
	const tag = `2a${"00".repeat(15)}`;
	const shares = split(fromHex("c800000000000000"));
	const urls: string[] = [];
	t.mock.method(globalThis, "fetch", async (url: string) => {
		urls.push(url);
		const i = RELAYERS.findIndex((r) => url.startsWith(r));
		return Response.json({ balanceShare: toHex(shares[i]) });
	});
	assert.equal(await getBalance(RELAYERS, tag), 200n);
	const k = keyShares(tag);
	assert.deepEqual(
		urls,
		RELAYERS.map((r, i) => `${r}/accounts/${accountHex(tag)}?key=${toHex(k[i])}`),
	);
	assert.ok(
		urls.every((u) => !u.includes(tag)),
		"the tag itself never leaves",
	);
	assert.throws(() => accountHex("2a"), RangeError);
});

test("judge claims send relayer i only share i of the tag", async (t) => {
	const posts: [string, { account: string; keyShare: string }][] = [];
	t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
		posts.push([url, JSON.parse(init.body as string)]);
		return Response.json({});
	});
	const tag = "11".repeat(16);
	await claimJudge(RELAYERS, tag);
	assert.deepEqual(
		posts.map(([u]) => u),
		RELAYERS.map((r) => `${r}/judge/claim`),
	);
	assert.ok(posts.every(([, b]) => b.account === accountHex(tag)));
	assert.equal(toHex(combine(posts.map(([, b]) => fromHex(b.keyShare)))), tag);
});

test("regression #99: a full table is a TableFullError; seats come from relayer 0", async (t) => {
	t.mock.method(globalThis, "fetch", async (url: string) =>
		url.endsWith("/judge/claim")
			? Response.json({ error: "table full" }, { status: 503 })
			: Response.json({ balanceShare: "00".repeat(8), seat: "waiting", mock: true }),
	);
	await assert.rejects(claimJudge(RELAYERS, "11".repeat(16)), TableFullError);
	assert.deepEqual(await getAccount(RELAYERS, "11".repeat(16)), {
		balance: 0n,
		seat: "waiting",
		mock: true,
	});
});

test("the demo counterparty always crosses, in the same market and size", async (t) => {
	const o = order(v.orders[0]);
	const c = counterOrder(o);
	assert.deepEqual({ ...c, side: o.side, price: o.price }, o);
	assert.notEqual(c.side, o.side);
	assert.equal(c.price + o.price, 100);
	const posts: { orderId: string; share: string }[] = [];
	t.mock.method(globalThis, "fetch", async (_: string, init: RequestInit) => {
		posts.push(JSON.parse(init.body as string));
		return Response.json({ batch: 4 }, { status: 202 });
	});
	const pair = await submitWithCounterparty(RELAYERS, o);
	assert.equal(posts.length, 6, "two orders, one share per relayer each");
	const shares = (id: string) => posts.filter((p) => p.orderId === id).map((p) => fromHex(p.share));
	assert.deepEqual(decodeOrder(combine(shares(pair.order.orderId))), o);
	assert.deepEqual(decodeOrder(combine(shares(pair.counter.orderId))), c);
});

test("submitOrder sends exactly one share to each relayer", async (t) => {
	const posts: [string, { orderId: string; share: string; token: string }][] = [];
	t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
		assert.equal(init.credentials, "omit");
		posts.push([url, JSON.parse(init.body as string)]);
		return Response.json({ batch: 3 + posts.length }, { status: 202 });
	});
	const o = order(v.orders[0]);
	const { orderId, batch, shares: sent, tokens } = await submitOrder(RELAYERS, o);
	assert.match(orderId, /^[0-9a-f]{32}$/);
	assert.equal(batch, 6);
	assert.deepEqual(
		posts.map(([, b]) => [b.share, b.token]),
		sent.map((s, i) => [s, tokens[i]]),
	);
	assert.equal(new Set(tokens).size, 3);
	assert.ok(tokens.every((k) => /^[0-9a-f]{32}$/.test(k)));
	assert.deepEqual(
		posts.map(([u]) => u),
		RELAYERS.map((r) => `${r}/orders`),
	);
	assert.ok(posts.every(([, b]) => b.orderId === orderId));
	const shares = posts.map(([, b]) => fromHex(b.share));
	assert.deepEqual(decodeOrder(combine(shares)), o);
});

test("submitWithdrawal sends each relayer only a fresh share of the tag", async (t) => {
	const posts: [string, { withdrawalId: string; share: string; amount: number }][] = [];
	t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
		posts.push([url, JSON.parse(init.body as string)]);
		return Response.json({}, { status: 202 });
	});
	const tag = `2a${"00".repeat(15)}`;
	const { withdrawalId } = await submitWithdrawal(RELAYERS, tag, 5850n, "uregtest1x");
	assert.deepEqual(
		posts.map(([u]) => u),
		RELAYERS.map((r) => `${r}/withdrawals`),
	);
	assert.ok(posts.every(([, b]) => b.withdrawalId === withdrawalId && b.amount === 5850));
	assert.equal(toHex(combine(posts.map(([, b]) => fromHex(b.share)))), tag);
	assert.ok(posts.every(([, b]) => b.share !== tag));
	assert.equal(payoutZats(5850n), 29_240_000n);
	await assert.rejects(submitWithdrawal(RELAYERS, tag, 2n, "u"), RangeError);
});

test("refuses two relayers on one origin", async (t) => {
	const fetch = t.mock.method(globalThis, "fetch", async () => {
		throw new Error("must not fetch");
	});
	const same = [RELAYERS[0], RELAYERS[1], `${RELAYERS[0]}/x`] as const;
	await assert.rejects(submitOrder(same, order(v.orders[0])), /distinct/);
	await assert.rejects(getFill(same, "00", []), /distinct/);
	assert.equal(fetch.mock.callCount(), 0);
});

test("getFill combines the three fill shares", async (t) => {
	const shares = split(fromHex(v.records[2]));
	const tokens = ["01", "02", "03"].map((b) => b.repeat(16));
	t.mock.method(globalThis, "fetch", async (url: string) => {
		const i = RELAYERS.findIndex((r) => url.startsWith(r));
		// Each relayer is asked with its own token only.
		assert.ok(url.endsWith(`?token=${tokens[i]}`));
		return Response.json({ status: "filled", fillShare: toHex(shares[i]) });
	});
	assert.deepEqual(await getFill(RELAYERS, "ab".repeat(16), tokens), {
		status: "filled",
		fill: { size: 5, totalCost: 445, side: 1, filled: true },
		fillShares: shares.map(toHex),
	});
});

test("viewDigest matches the relayer's pinned vector", () => {
	// apps/relayer/src/api/tests.rs `orders_contract`: share 1 of the split vector.
	assert.equal(viewDigest(fromHex(v.split.shares[1])), "11fde0156c756157bd540f66eab111fc");
});
