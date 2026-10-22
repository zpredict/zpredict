// In-memory state of all three mock relayers.
//
// MOCK: one process holds every relayer's shares. A real relayer holds only its own and
// never sees the others'; `views[i]` is what relayer i publishes: digests, never shares.
import { randomBytes } from "node:crypto";
import { viewDigest } from "@zpredict/sdk";
import { PORTS, START_HEIGHT, VIEW_KEEP } from "./config.mjs";
import { MARKET_DEFS } from "./markets.mjs";
import { roll, SIGNED } from "./rolling.mjs";

export const chain = { batch: 1, height: START_HEIGHT };
/** Public market objects (`GET /markets`); the bots' fair value stays private. */
export const markets = [...MARKET_DEFS.map(({ fair: _fair, ...m }) => m), ...SIGNED];
roll(markets, chain.height);

/** orderId -> { shares: [Buffer|null x3], tokens: [string|null x3], status, fillShares, born } */
export const orders = new Map();
/** tag (hex32) -> { bal: bigint half-ticks, mask: [Buffer, Buffer] } */
const accounts = new Map();
/** account id (hex16) -> each relayer's share of the tag (Buffer | null) x3 */
export const keys = new Map();
/** Per relayer: a digest of every share it has received. */
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

export function see(i, kind, share) {
	const v = views[i];
	v.items.push({ seq: ++v.seq, kind, digest: viewDigest(share) });
	if (v.items.length > VIEW_KEEP) v.items.shift();
}

/** Relayer i receives its share of an order and its read token. False if it already had one. */
export function accept(i, orderId, share, token = null) {
	let o = orders.get(orderId);
	if (!o) {
		o = {
			shares: [null, null, null],
			tokens: [null, null, null],
			status: "pending",
			fillShares: null,
			born: chain.batch,
		};
		orders.set(orderId, o);
	}
	if (o.shares[i]) return false;
	o.shares[i] = share;
	o.tokens[i] = token;
	see(i, "order", share);
	return true;
}
