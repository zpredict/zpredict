// Operator-seeded demo activity (#166): six judge-mode accounts (mock credit, never
// withdrawable) trade every open market against each other in pairs through the live relayers and the
// real MPC, near the Polymarket reference price, so no market page is empty.
//   node scripts/seed-activity.mjs <keys file> [rounds=1]
// The keys file holds the account tags (created on first run, mode 600); never print it.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
	claimJudge,
	getBalance,
	getFill,
	getMarkets,
	newTag,
	RELAYERS,
	submitOrder,
} from "../packages/sdk/dist/index.js";

const [file, rounds = "1"] = process.argv.slice(2);
if (!file) throw new Error("usage: seed-activity.mjs <keys file> [rounds]");
const ACCOUNTS = 6; // judge credit is 25 units each; every claim takes a balance-table row (#64)
const tags = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
while (tags.length < ACCOUNTS) tags.push(newTag());
writeFileSync(file, JSON.stringify(tags), { mode: 0o600 });
for (const tag of tags) await claimJudge(RELAYERS, tag);

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
	const size = 1 + Math.floor(Math.random() * 3);
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
	const open = (await getMarkets(RELAYERS[0])).filter((m) => m.status === "open");
	let filled = 0;
	// Four pairs per batch: the circuit has 8 order slots.
	for (let i = 0; i < open.length; i += 4) {
		const rich = await richest();
		const res = await Promise.all(
			open
				.slice(i, i + 4)
				.map((m, j) => trade(m, rich[j % 3], rich[3 + (j % 3)]).catch(() => false)),
		);
		filled += res.filter(Boolean).length;
	}
	console.log(`round ${r + 1}: ${filled}/${open.length} markets filled`);
}
