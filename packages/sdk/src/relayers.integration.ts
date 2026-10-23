// The sdk against three real relayer binaries with the local dev config
// (apps/relayer/config/r*.toml), offline: judge claim, an order with the demo counterparty,
// the fill, the balance, the public view and a refused withdrawal.
//   RELAYER_BIN=<zpredict-relayer> node --test dist/relayers.integration.js
// The binary needs `--features dev-insecure` (plaintext matcher, fast) unless
// REAL_MPC=1, which runs the real 3-party MPC (minutes; nightly CI).
import assert from "node:assert/strict";
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import {
	claimJudge,
	fromHex,
	getAccount,
	getFill,
	getMarkets,
	getView,
	newTag,
	type Relayers,
	submitWithCounterparty,
	submitWithdrawal,
	viewDigest,
} from "./index.js";

const BIN = process.env.RELAYER_BIN;
const REAL = process.env.REAL_MPC === "1";
/** Fill wait: one window with the plaintext matcher; compile + preprocess + run with MPC. */
const FILL_MS = REAL ? 15 * 60_000 : 60_000;
const config = new URL("../../../apps/relayer/config/", import.meta.url).pathname;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A port nothing listens on now: the dev config's 4101-4103 may be taken by `dev:mock`. */
const freePort = () =>
	new Promise<number>((ok) => {
		const s = createServer().listen(0, "127.0.0.1", () => {
			const { port } = s.address() as { port: number };
			s.close(() => ok(port));
		});
	});

let relayers: Relayers;

let dir = "";
const procs: ChildProcess[] = [];
const logs: string[] = ["", "", ""];

async function until<T>(what: string, ms: number, f: () => Promise<T | undefined>): Promise<T> {
	const end = Date.now() + ms;
	for (;;) {
		const v = await f().catch(() => undefined);
		if (v !== undefined) return v;
		const dead = procs.some((p) => p.exitCode !== null);
		if (dead || Date.now() > end) {
			throw new Error(
				`${dead ? "a relayer exited" : "timed out"}: ${what}\n${logs.join("\n---\n")}`,
			);
		}
		await sleep(500);
	}
}

before(async () => {
	if (!BIN) return;
	dir = mkdtempSync(join(tmpdir(), "zp-relayers-"));
	mkdirSync(join(dir, "keys"));
	const ports: number[] = [];
	for (let i = 0; i < 6; i++) ports.push(await freePort());
	const peers = ports.slice(3).map((p) => `"127.0.0.1:${p}"`);
	relayers = ports.slice(0, 3).map((p) => `http://127.0.0.1:${p}`) as never;
	for (const i of [0, 1, 2]) {
		const toml = readFileSync(join(config, `r${i}.toml`), "utf8")
			.replace(/^listen = .*$/m, `listen = "127.0.0.1:${ports[i]}"`)
			.replace(/^peers = .*$/m, `peers = [${peers.join(", ")}]`);
		writeFileSync(join(dir, `r${i}.toml`), toml);
		execFileSync(BIN, ["keygen", join(dir, "keys", `r${i}`)]);
	}
	const env = {
		...process.env,
		ZPREDICT_ORACLE_LIGHTWALLETD: "", // offline: no chain, no Polymarket
		ZPREDICT_INSECURE_MATCHER: REAL ? "false" : "true",
		ZPREDICT_WINDOW_SECS: REAL ? "4" : "2",
	};
	for (const i of [0, 1, 2]) {
		const p = spawn(BIN, [join(dir, `r${i}.toml`)], { env, stdio: ["ignore", "pipe", "pipe"] });
		p.stdout?.on("data", (d) => (logs[i] += d));
		p.stderr?.on("data", (d) => (logs[i] += d));
		procs.push(p);
	}
	await until("health", 60_000, async () => {
		const up = await Promise.all(relayers.map((u) => fetch(`${u}/health`).then((r) => r.ok)));
		return up.every(Boolean) || undefined;
	});
});

after(() => {
	for (const p of procs) p.kill();
	if (dir) rmSync(dir, { recursive: true, force: true });
});

test("judge mode, a demo-counterparty fill, balance, view and withdrawal", {
	skip: !BIN && "set RELAYER_BIN",
}, async () => {
	const tag = newTag();
	await claimJudge(relayers, tag);
	await claimJudge(relayers, tag); // a retry credits nothing
	assert.deepEqual(await getAccount(relayers, tag), { balance: 5000n, seat: "seated", mock: true });

	// YES 60 × 3 against its own NO 40 × 3: one unit per contract, at 60.
	const order = { market: 1, side: 0 as const, price: 60, size: 3, key: tag };
	let pair = await submitWithCounterparty(relayers, order);
	const read = (o: typeof pair.order) =>
		until("fill", FILL_MS, async () => {
			const f = await getFill(relayers, o.orderId, o.tokens);
			return f.status === "pending" ? undefined : f;
		});
	let fill = await read(pair.order);
	if (!fill.fill?.filled) {
		// A batch boundary fell between the two orders: neither fills; the UI retries once too.
		pair = await submitWithCounterparty(relayers, order);
		fill = await read(pair.order);
	}
	assert.deepEqual(fill.fill, { size: 3, totalCost: 360, side: 0, filled: true });
	assert.deepEqual((await read(pair.counter)).fill, {
		size: 3,
		totalCost: 240,
		side: 1,
		filled: true,
	});
	assert.equal((await getAccount(relayers, tag)).balance, 5000n - 600n);
	const m = (await getMarkets(relayers[0])).find((x) => x.id === 1);
	assert.equal(m?.lastPrice, 60);

	// Each relayer's public view has a digest of the share it got, never the share or orderId.
	for (const [i, u] of relayers.entries()) {
		const view = await getView(u);
		const digests = view.items.map((x) => x.digest);
		assert.ok(digests.includes(viewDigest(fromHex(pair.order.shares[i]))), `relayer ${i}`);
		const text = JSON.stringify(view);
		assert.ok(!text.includes(pair.order.orderId) && !text.includes(pair.order.shares[i]));
		// A fill share needs this relayer's read token.
		const bare = await fetch(`${u}/orders/${pair.order.orderId}`);
		assert.equal(bare.status, 404);
	}

	// Settlement is off in the dev config, so there is nothing to withdraw to.
	await assert.rejects(submitWithdrawal(relayers, tag, 1000n, "utest1x"), /404/);
});
