import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fromHex } from "./bytes.js";
import { solveFaucetPow } from "./faucet.js";
import { MEMO_LEN } from "./memo.js";

const v = JSON.parse(
	readFileSync(new URL("../../settle/testdata/memo-vectors.json", import.meta.url), "utf8"),
);

test("faucet proof of work matches apps/faucet (pow.rs cross_language_vector)", async () => {
	const memo = new Uint8Array(MEMO_LEN);
	memo.set(fromHex(v.memos[0].memo));
	const c = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f2021222324252627";
	assert.equal(await solveFaucetPow(c, memo, 12), 720);
});
