import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fromHex, toHex } from "./bytes.js";
import { getMemoKeys, type Relayers } from "./index.js";
import {
	accountHex,
	DENOMINATIONS,
	depositRequest,
	depositUri,
	encodeMemo,
	keyShares,
	MEMO_LEN,
	type MemoKeys,
	memoParam,
	splitDeposit,
	UNIT_ZATS,
	unitsToZec,
} from "./memo.js";

// Written by `cargo test -p zpredict-settle --test memo_vectors`.
const v = JSON.parse(
	readFileSync(new URL("../../settle/testdata/memo-vectors.json", import.meta.url), "utf8"),
);
const keys = v.relayers.map((r: { public: string }) => r.public) as unknown as MemoKeys;

test("memos encode exactly like settle", async () => {
	for (const m of v.memos) {
		assert.equal(accountHex(m.tag), m.account);
		assert.deepEqual(keyShares(m.tag).map(toHex), m.keyShares);
		const memo = await encodeMemo(m.tag, keys, fromHex(m.esk));
		assert.equal(memo.length, MEMO_LEN);
		assert.equal(toHex(memo.subarray(0, m.memo.length / 2)), m.memo);
		assert.ok(memo.subarray(m.memo.length / 2).every((b) => b === 0));
		assert.equal(memoParam(memo), m.uriMemo);
	}
});

test("a fresh memo uses a fresh ephemeral key", async () => {
	const tag = v.memos[0].tag;
	const [a, b] = [await encodeMemo(tag, keys), await encodeMemo(tag, keys)];
	assert.notEqual(toHex(a.subarray(2, 34)), toHex(b.subarray(2, 34)));
	assert.deepEqual([...a.subarray(0, 2)], [0xff, 0x02]);
});

test("bad tags and keys are refused", async () => {
	await assert.rejects(encodeMemo("00", keys), RangeError);
	await assert.rejects(encodeMemo(v.memos[0].tag, [keys[0], keys[1], "00"]), RangeError);
	// A low-order point (all-zero shared secret) is rejected by X25519 itself.
	await assert.rejects(encodeMemo(v.memos[0].tag, [keys[0], keys[1], "00".repeat(32)]));
});

test("denominations and the ZIP 321 request match settle", () => {
	assert.equal(UNIT_ZATS, BigInt(v.unitZats));
	assert.deepEqual([...DENOMINATIONS], v.denominations);
	assert.deepEqual(DENOMINATIONS.map(unitsToZec), ["0.01", "0.05", "0.25", "1", "5", "25"]);
	const memo = fromHex(v.memos[0].memo.padEnd(MEMO_LEN * 2, "0"));
	assert.equal(
		depositUri("utest1escrow", 5, memo),
		`zcash:utest1escrow?amount=0.05&memo=${v.memos[0].uriMemo}`,
	);
	assert.throws(() => depositUri("utest1escrow", 2 as 1, memo), RangeError);
});

test("memo keys come one per relayer, in order", async () => {
	const relayers: Relayers = ["https://a.test", "https://b.test", "https://c.test"];
	const seen: string[] = [];
	const reply = (relayer: number) => ({ relayer, memoKey: keys[relayer] });
	globalThis.fetch = (async (url: string) => {
		seen.push(url);
		const i = relayers.findIndex((r) => url.startsWith(r));
		return new Response(JSON.stringify(reply(i)));
	}) as typeof fetch;
	assert.deepEqual(await getMemoKeys(relayers), keys);
	assert.deepEqual(
		seen,
		relayers.map((r) => `${r}/memo-key`),
	);

	globalThis.fetch = (async () => new Response(JSON.stringify(reply(0)))) as typeof fetch;
	await assert.rejects(getMemoKeys(relayers), /relayer 1 returned a bad memo key/);
	await assert.rejects(getMemoKeys([relayers[0], relayers[0], relayers[2]]), /distinct/);
});

test("any amount splits into the fewest credited notes, paid in one request", () => {
	assert.deepEqual(splitDeposit(37), [25, 5, 5, 1, 1]);
	assert.deepEqual(splitDeposit(730), [500, 100, 100, 25, 5]);
	assert.deepEqual(splitDeposit(2500), [2500]);
	assert.throws(() => splitDeposit(0), RangeError);
	assert.throws(() => splitDeposit(1.5), RangeError);
	assert.throws(() => splitDeposit(1e20), RangeError); // would never count down as a float
	assert.throws(() => splitDeposit(2500 * 13), RangeError);
	const memo = new Uint8Array(512).fill(1);
	const one = depositRequest("utest1escrow", [{ units: 5, memo }]);
	assert.equal(one, depositUri("utest1escrow", 5, memo));
	const two = depositRequest("utest1escrow", [
		{ units: 25, memo },
		{ units: 1, memo },
	]);
	assert.match(
		two,
		/^zcash:\?address=utest1escrow&amount=0\.25&memo=[\w-]+&address\.1=utest1escrow&amount\.1=0\.01&memo\.1=[\w-]+$/,
	);
});
