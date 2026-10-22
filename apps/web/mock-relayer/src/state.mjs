// In-memory state of all three mock relayers.
//
// MOCK: one process holds every relayer's shares. A real relayer holds only its own and
// never sees the others'; `views[i]` is exactly what relayer i would see.
import { randomBytes } from "node:crypto";
import { PORTS, START_HEIGHT, VIEW_KEEP } from "./config.mjs";
import { MARKET_DEFS } from "./markets.mjs";
import { roll, SIGNED } from "./rolling.mjs";
import { hex } from "./shares.mjs";

export const chain = { batch: 1, height: START_HEIGHT };
/** Public market objects (`GET /markets`); the bots' fair value stays private. */
export const markets = [...MARKET_DEFS.map(({ fair: _fair, ...m }) => m), ...SIGNED];
roll(markets, chain.height);

/** orderId -> { shares: [Buffer|null x3], status, fillShares, born } */
export const orders = new Map();
/** account (bigint) -> { bal: bigint half-ticks, mask: [Buffer, Buffer] } */
const accounts = new Map();
/** Per relayer: the share stream it has seen. */
export const views = PORTS.map(() => ({ seq: 0, items: [] }));

export function account(id) {
	let a = accounts.get(id);
	if (!a) {
		// ponytail: masks fixed per account, so shares read across a batch can mismatch for one poll
		a = { bal: 0n, mask: [randomBytes(8), randomBytes(8)] };
		accounts.set(id, a);
	}
	return a;
}

export function see(i, kind, orderId, share) {
	const v = views[i];
	v.items.push({ seq: ++v.seq, kind, orderId, share: hex(share) });
	if (v.items.length > VIEW_KEEP) v.items.shift();
}

/** Relayer i receives its share of an order. False if it already had one. */
export function accept(i, orderId, share) {
	let o = orders.get(orderId);
	if (!o) {
		o = {
			shares: [null, null, null],
			status: "pending",
			fillShares: null,
			born: chain.batch,
		};
		orders.set(orderId, o);
	}
	if (o.shares[i]) return false;
	o.shares[i] = share;
	see(i, "order", orderId, share);
	return true;
}
