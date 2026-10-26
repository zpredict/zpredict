// Operator-seeded demo activity (#166): the operator's accounts, funded by real testnet
// deposits (no judge credit, #186), trade every open market against each other through the
// live relayers and the real MPC, one share at a time near the Polymarket reference price, so
// no market page is empty.
//   node scripts/seed-activity.mjs <keys file> [rounds=1]
// The keys file is a JSON array of funded account tags (mode 600); never print it.
import { readFileSync } from "node:fs";
import {
	getBalance,
	getFill,
	getMarkets,
	RELAYERS,
	submitOrder,
} from "../packages/sdk/dist/index.js";

const [file, rounds = "1"] = process.argv.slice(2);
if (!file) throw new Error("usage: seed-activity.mjs <keys file> [rounds]");
const tags = JSON.parse(readFileSync(file, "utf8"));
if (tags.length < 2) throw new Error("need at least two funded accounts");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (p) => Math.min(97, Math.max(3, Math.round(p)));
/** The two accounts with the most balance left. */
async function richest() {
	const bal = await Promise.all(tags.map((t) => getBalance(RELAYERS, t)));
	return tags
		.map((t, i) => [t, bal[i]])
		.sort((x, y) => (y[1] > x[1] ? 1 : -1))
		.map(([t]) => t);
}

/** A buys YES at p+1, B buys NO at 101-p: they cross, clearing near p. */
async function trade(m, a, b) {
	const p = clamp((m.reference?.price ?? m.lastPrice ?? 50) + (Math.random() * 4 - 2));
	const size = 1; // small: one share, one unit of collateral per pair
	const [yes, no] = await Promise.all([
		submitOrder(RELAYERS, { market: m.id, side: 0, price: p + 1, size, key: a }),
		submitOrder(RELAYERS, { market: m.id, side: 1, price: 101 - p, size, key: b }),
	]);
	for (;;) {
		await sleep(5000);
		const [f1, f2] = await Promise.all([
			getFill(RELAYERS, yes.orderId, yes.tokens),
			getFill(RELAYERS, no.orderId, no.tokens),
		]);
		if (f1.status !== "pending" && f2.status !== "pending") return Boolean(f1.fill?.filled);
	}
}

for (let r = 0; r < Number(rounds); r++) {
	// Hourly markets are skipped: their positions must be paid out at every resolution, which
	// holds the batch for minutes (#174). Markets with no price yet go first.
	const open = (await getMarkets(RELAYERS[0]))
		.filter((m) => m.status === "open" && !m.rolling)
		.sort((x, y) => Number(x.lastPrice !== undefined) - Number(y.lastPrice !== undefined));
	let filled = 0;
	// Four pairs per batch: the circuit has 8 order slots.
	for (let i = 0; i < open.length; i += 4) {
		const rich = await richest();
		const res = await Promise.all(
			open
				.slice(i, i + 4)
				.map((m, j) => trade(m, rich[j % 2], rich[(j + 1) % 2]).catch(() => false)),
		);
		filled += res.filter(Boolean).length;
	}
	console.log(`round ${r + 1}: ${filled}/${open.length} markets filled`);
}
