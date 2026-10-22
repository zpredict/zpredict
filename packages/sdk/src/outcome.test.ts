import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { toHex } from "./bytes.js";
import { getGroupKey, type Relayers } from "./index.js";
import { outcomeMessage, verifyOutcome } from "./outcome.js";

// Written by `UPDATE_VECTORS=1 cargo test -p zpredict-settle --test outcome_vectors`.
const v = JSON.parse(
	readFileSync(new URL("../../settle/testdata/outcome-vectors.json", import.meta.url), "utf8"),
);

const signed = (c: (typeof v.cases)[number]) => ({
	id: c.market,
	outcome: c.outcome,
	blockHeight: c.height,
	blockHash: c.blockHash,
	outcomeSig: c.sig,
});

test("outcome messages and signatures match settle", () => {
	for (const c of v.cases) {
		assert.equal(toHex(outcomeMessage(c)), c.message);
		assert.equal(verifyOutcome(signed(c), v.groupKey), c.valid, JSON.stringify(c));
	}
});

test("missing or malformed fields never verify", () => {
	const m = signed(v.cases[0]);
	assert.equal(verifyOutcome({ ...m, outcomeSig: undefined }, v.groupKey), false);
	assert.equal(verifyOutcome({ ...m, outcomeSig: "zz" }, v.groupKey), false);
	assert.equal(verifyOutcome(m, "00".repeat(32)), false);
	assert.equal(verifyOutcome({ ...m, id: m.id + 1 }, v.groupKey), false);
	assert.equal(verifyOutcome({ ...m, blockHeight: m.blockHeight + 1 }, v.groupKey), false);
});

test("the group key must be the same at all three relayers", async () => {
	const relayers: Relayers = ["https://a.test", "https://b.test", "https://c.test"];
	const real = globalThis.fetch;
	const serve = (keys: string[]) => {
		globalThis.fetch = (async (url: string) => {
			const i = relayers.findIndex((r) => url.startsWith(r));
			return new Response(JSON.stringify({ relayer: i, groupKey: keys[i], threshold: 2 }));
		}) as typeof fetch;
	};
	try {
		serve([v.groupKey, v.groupKey, v.groupKey]);
		assert.equal(await getGroupKey(relayers), v.groupKey);
		serve([v.groupKey, v.groupKey, "11".repeat(32)]);
		assert.equal(await getGroupKey(relayers), null);
	} finally {
		globalThis.fetch = real;
	}
});
