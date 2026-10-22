// One batch: the step the real relayers run inside 3-party MPC.
// MOCK: here the shares are combined in the clear.
import { decodeOrder } from "@zpredict/sdk";
import { clear, fillRecords } from "./clearing.mjs";
import { HISTORY_KEEP, PORTS, SHARE_TIMEOUT_BATCHES } from "./config.mjs";
import { roll } from "./rolling.mjs";
import { split, xor } from "./shares.mjs";
import { account, chain, markets, orders, see } from "./state.mjs";

const isOpen = (id) => markets.some((m) => m.id === id && m.status === "open");

/** Orders with all three shares, plus any whose shares timed out. */
function collect() {
	const ready = [];
	for (const [id, o] of orders) {
		if (o.status !== "pending") continue;
		const complete = o.shares.every(Boolean);
		if (complete || chain.batch - o.born > SHARE_TIMEOUT_BATCHES)
			ready.push({
				id,
				o,
				order: complete ? decodeOrder(xor(...o.shares)) : null,
			});
	}
	return ready;
}

/** An order that can't cover its worst-case cost becomes a dummy (size 0). */
function fund(ready) {
	const reserved = new Map();
	return ready.map(({ order: d }) => {
		if (!d || !isOpen(d.market)) return null;
		const max = BigInt(d.size) * BigInt(d.price) * 2n;
		const r = (reserved.get(d.account) ?? 0n) + max;
		if (account(d.account).bal < r) return { ...d, size: 0 };
		reserved.set(d.account, r);
		return d;
	});
}

/** Public price: YES cents at the batch's latest cross (half-ticks / 2). Nothing else leaves. */
function publishPrice(m, fills) {
	const last = fills.at(-1);
	if (!last) return;
	m.lastPrice = last.yesCost / 2;
	m.history = [...(m.history ?? []), m.lastPrice].slice(-HISTORY_KEEP);
}

/** One 10-byte fill record per order (all zero if unfilled), cleared market by market. */
function records(live) {
	const out = live.map(() => new Uint8Array(10));
	for (const m of markets) {
		const idx = live.flatMap((d, k) => (d?.market === m.id ? [k] : []));
		const sub = idx.map((k) => live[k]);
		const fills = clear(sub);
		publishPrice(m, fills);
		fillRecords(sub, fills).forEach((r, j) => {
			out[idx[j]] = r;
		});
	}
	return out;
}

export function runBatch() {
	const ready = collect();
	const recs = records(fund(ready));
	ready.forEach(({ id, o, order }, k) => {
		const fill = Buffer.from(recs[k]);
		const filled = fill[9] === 1;
		if (filled) account(order.account).bal -= BigInt(fill.readUInt32LE(4));
		o.status = filled ? "filled" : "unfilled";
		o.fillShares = split(fill);
		// Every order in the batch gets a fill share, filled or not: same shape either way.
		PORTS.forEach((_, i) => {
			see(i, "fill", id, o.fillShares[i]);
		});
	});
	chain.batch++;
	chain.height++;
	roll(markets, chain.height);
}
