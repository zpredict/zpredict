import { HALF_TICKS_PER_UNIT, type Market, type Side } from "@zpredict/sdk";
import type { MyOrder } from "@/hooks/useOrders";

/** Half-ticks a winning share pays: one unit. */
const PAYOUT = Number(HALF_TICKS_PER_UNIT);

/** One holding: this browser's filled shares of one side of one market. Half-ticks throughout. */
export interface Position {
	market: number;
	side: Side;
	shares: number;
	/** What the fills cost. */
	cost: number;
	/** What the shares are worth now: the last public price, or the payout once resolved;
	 *  null before the market has any price. */
	value: number | null;
	/** Shares bought by the demo counterparty (a self-trade), which hedge the trader's own. */
	hedged: boolean;
	/** Paid out already: the market resolved (winnings are in the balance) or left `/markets`. */
	settled: boolean;
}

/** The value of `shares` of `side`: resolved, 1 unit per winning share; else at the last price. */
function worth(m: Market | undefined, side: Side, shares: number): number | null {
	if (!m) return null;
	if (m.status === "resolved" && m.outcome) {
		return (m.outcome === "yes") === (side === 0) ? shares * PAYOUT : 0;
	}
	if (m.lastPrice === undefined) return null;
	const cents = side === 0 ? m.lastPrice : 100 - m.lastPrice;
	return Math.round((shares * cents * PAYOUT) / 100);
}

/** Holdings from this browser's own filled orders (the relayers never learn them). */
export function positions(orders: MyOrder[], markets: Market[]): Position[] {
	const byId = new Map(markets.map((m) => [m.id, m]));
	const held = new Map<string, Position>();
	for (const o of orders) {
		if (!o.fill?.filled) continue;
		const side = o.fill.side;
		const hedged = Boolean(o.counterOf);
		const key = `${o.market}:${side}:${hedged}`;
		const p = held.get(key) ?? {
			market: o.market,
			side,
			shares: 0,
			cost: 0,
			value: null,
			hedged,
			settled: false,
		};
		p.shares += o.fill.size;
		p.cost += o.fill.totalCost;
		held.set(key, p);
	}
	return [...held.values()].map((p) => {
		const m = byId.get(p.market);
		// Resolved markets stay listed 24 h; one missing from a loaded list resolved before that.
		const settled = m ? m.status === "resolved" : markets.length > 0;
		return { ...p, value: worth(m, p.side, p.shares), settled };
	});
}

/** One step of the P&L curve: unix seconds and P&L in half-ticks. */
export interface PnlPoint {
	t: number;
	v: number;
}

/** A market's YES price (cents) at `t`: its last public clearing price at or before then. */
function priceAt(m: Market | undefined, t: number): number | null {
	if (!m?.history || m.historyAt?.length !== m.history.length) return null;
	let p: number | null = null;
	for (let i = 0; i < m.history.length; i++) {
		if (m.historyAt[i] > t) break;
		if (m.historyAt[i] > 0) p = m.history[i];
	}
	return p;
}

/** YES cents at `t`: the payout once resolved (at `now`), else the public price then. */
function yesAt(m: Market | undefined, t: number, now: number): number | null {
	if (t === now && m?.status === "resolved" && m.outcome) return m.outcome === "yes" ? 100 : 0;
	return priceAt(m, t);
}

/**
 * P&L over time of the trader's own fills (not the self-trade legs, which net out), valued at
 * the public prices of the moment, from the first fill to `now`. Computed in this browser only.
 */
export function pnlSeries(orders: MyOrder[], markets: Market[], now: number): PnlPoint[] {
	const fills = orders
		.filter((o) => o.fill?.filled && !o.counterOf)
		.map((o) => ({ ...o, t: Math.floor(o.at / 1000) }))
		.sort((a, b) => a.t - b.t);
	if (fills.length === 0) return [];
	const byId = new Map(markets.map((m) => [m.id, m]));
	const held = new Set(fills.map((f) => f.market));
	const times = new Set([...fills.map((f) => f.t), now]);
	for (const id of held)
		for (const t of byId.get(id)?.historyAt ?? []) if (t >= fills[0].t && t <= now) times.add(t);
	return [...times]
		.sort((a, b) => a - b)
		.map((t) => {
			let v = 0;
			for (const f of fills) {
				if (f.t > t || !f.fill) continue;
				// No public price yet: the fill's own average, as a YES price.
				const avg = f.fill.totalCost / f.fill.size / 2;
				const yes = yesAt(byId.get(f.market), t, now) ?? (f.fill.side === 0 ? avg : 100 - avg);
				const cents = f.fill.side === 0 ? yes : 100 - yes;
				v += Math.round((f.fill.size * cents * PAYOUT) / 100) - f.fill.totalCost;
			}
			return { t, v };
		});
}
