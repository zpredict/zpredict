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
		const p = held.get(key) ?? { market: o.market, side, shares: 0, cost: 0, value: null, hedged };
		p.shares += o.fill.size;
		p.cost += o.fill.totalCost;
		held.set(key, p);
	}
	return [...held.values()].map((p) => ({
		...p,
		value: worth(byId.get(p.market), p.side, p.shares),
	}));
}
