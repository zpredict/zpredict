// The mock answers order reads like the real relayers (apps/relayer/README.md): every
// batched order is "filled" with a fill share, hit or miss; "unfilled" (no share) only
// means it expired before all three shares arrived.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";
import { combine, decodeFill, encodeOrder, fromHex } from "@zpredict/sdk";
import { runBatch } from "./batch.mjs";
import { SHARE_TIMEOUT_BATCHES } from "./config.mjs";
import { handler } from "./routes.mjs";
import { hex, split } from "./shares.mjs";
import { accept } from "./state.mjs";

test("regression #136: a batched miss reads filled (flag 0); an expired order unfilled", async () => {
	const servers = [0, 1, 2].map((i) => createServer(handler(i)).listen(0));
	await Promise.all(servers.map((s) => new Promise((ok) => s.once("listening", ok))));
	const read = (i, id, token) =>
		fetch(`http://localhost:${servers[i].address().port}/orders/${id}?token=${token}`).then((r) =>
			r.json(),
		);
	const order = { market: 1, side: 0, price: 1, size: 1, key: "77".repeat(16) };
	const [lone, partial] = [hex(randomBytes(16)), hex(randomBytes(16))];
	const tokens = [0, 1, 2].map(() => hex(randomBytes(16)));
	split(encodeOrder(order)).forEach((s, i) => {
		accept(i, lone, s, tokens[i]);
		if (i < 2) accept(i, partial, s, tokens[i]);
	});
	for (let b = 0; b <= SHARE_TIMEOUT_BATCHES + 1; b++) runBatch();
	try {
		const got = await Promise.all([0, 1, 2].map((i) => read(i, lone, tokens[i])));
		assert.ok(got.every((r) => r.status === "filled"));
		const rec = decodeFill(combine(got.map((r) => fromHex(r.fillShare))));
		assert.equal(rec.filled, false, "nobody took the other side");
		assert.deepEqual(await read(0, partial, tokens[0]), { status: "unfilled" });
	} finally {
		for (const s of servers) s.close();
	}
});
