// Background traders, so the demo has counterparties and a live stream of noise.
// They submit through the same share path as the browser.
import { randomBytes } from "node:crypto";
import { encodeOrder } from "@zpredict/sdk";
import { MARKET_DEFS } from "./markets.mjs";
import { hex, split } from "./shares.mjs";
import { accept, account, markets } from "./state.mjs";

const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

const bots = Array.from({ length: 6 }, () => randomBytes(8).readBigUInt64LE());
for (const b of bots) account(b).bal = 10n ** 12n;
/** Drifting fair YES price per market, in cents. */
const fair = new Map(MARKET_DEFS.map((m) => [m.id, m.fair]));

function order(m, side) {
	const f = fair.get(m.id);
	const price = clamp((side === 0 ? f : 100 - f) + rnd(-2, 3), 1, 99);
	const bytes = encodeOrder({
		market: m.id,
		side,
		price,
		size: rnd(1, 12),
		account: bots[rnd(0, bots.length - 1)],
	});
	const id = hex(randomBytes(16));
	split(bytes).forEach((s, i) => {
		accept(i, id, s);
	});
}

/** A YES and a NO quote per market per tick, so every batch has counterparties on both sides. */
export function botOrders() {
	for (const m of markets.filter((x) => x.status === "open")) {
		fair.set(m.id, clamp((fair.get(m.id) ?? 50) + rnd(-1, 1), 4, 96));
		order(m, 0);
		order(m, 1);
	}
}
