// The relayer client's error paths: what the browser does when relayers disagree or fail.
import assert from "node:assert/strict";
import { type TestContext, test } from "node:test";
import {
	claimJudge,
	fromHex,
	getFill,
	getMarkets,
	getWithdrawal,
	RELAYERS,
	split,
	TableFullError,
	toHex,
} from "./index.js";

type Reply = Record<string, unknown> | { status: number; body: unknown };
/** Relayer i answers `replies[i]`; returns the URLs asked. */
function serve(t: TestContext, replies: Reply[]) {
	const urls: string[] = [];
	t.mock.method(globalThis, "fetch", async (url: string) => {
		urls.push(url);
		const r = replies[RELAYERS.findIndex((x) => url.startsWith(x))];
		return "body" in r ? Response.json(r.body, { status: r.status as number }) : Response.json(r);
	});
	return urls;
}

const tokens = ["01", "02", "03"].map((b) => b.repeat(16));
const fill = split(fromHex("03000000590100000101")).map(toHex);

test("getFill: pending until all three batched it; unfilled only if all three say so", async (t) => {
	const filled = (i: number) => ({ status: "filled", fillShare: fill[i] });
	serve(t, [filled(0), { status: "pending" }, filled(2)]);
	assert.deepEqual(await getFill(RELAYERS, "ab".repeat(16), tokens), { status: "pending" });
	t.mock.restoreAll();
	serve(t, [{ status: "unfilled" }, { status: "unfilled" }, { status: "unfilled" }]);
	assert.deepEqual(await getFill(RELAYERS, "ab".repeat(16), tokens), { status: "unfilled" });
});

test("getFill: relayers that disagree are an error, never a made-up fill", async (t) => {
	for (const replies of [
		[{ status: "filled", fillShare: fill[0] }, { status: "unfilled" }, { status: "unfilled" }],
		[
			{ status: "filled" },
			{ status: "filled", fillShare: fill[1] },
			{ status: "filled", fillShare: fill[2] },
		],
	]) {
		serve(t, replies);
		await assert.rejects(getFill(RELAYERS, "ab".repeat(16), tokens), /disagree/);
		t.mock.restoreAll();
	}
});

test("a relayer's error status rejects with the status, never parses its body", async (t) => {
	serve(t, [{ status: 500, body: [] }, {}, {}]);
	await assert.rejects(getMarkets(RELAYERS[0]), /^Error: 500 from https:\/\/r0\./);
	t.mock.restoreAll();
	// Only 503 is "table full"; anything else is passed through as is.
	serve(t, [{ status: 409, body: { error: "account exists" } }, {}, {}]);
	await assert.rejects(claimJudge(RELAYERS, "11".repeat(16)), (e) => {
		assert.ok(!(e instanceof TableFullError));
		return /409/.test(String(e));
	});
});

test("withdrawal status comes from relayer 0, the one that pays", async (t) => {
	const urls = serve(t, [{ status: "paid", txid: "ee".repeat(32) }, {}, {}]);
	const id = "cd".repeat(16);
	assert.deepEqual(await getWithdrawal(RELAYERS, id), { status: "paid", txid: "ee".repeat(32) });
	assert.deepEqual(urls, [`${RELAYERS[0]}/withdrawals/${id}`]);
});
