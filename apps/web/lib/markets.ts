import type { Market, Side } from "@zpredict/sdk";

/** Category tag per resolver plugin (packages/plugins/*); same labels as the landing. */
const CATEGORIES: Record<string, string> = {
	"nu7-activation": "Network upgrade",
	"ironwood-pool": "Ironwood pool",
	"shielded-actions": "Shielded activity",
	polymarket: "Mirrored",
};

export const category = (m: Market) =>
	m.rolling ? "Hourly · shielded activity" : (m.category ?? CATEGORIES[m.plugin] ?? m.plugin);

/** A mirrored Polymarket market: Polymarket (UMA) is its oracle, not chain data. */
export const isMirrored = (m: Market) => m.plugin === "polymarket";

/**
 * The reference's outbound link (relayer-supplied), only if it is an https page on
 * Polymarket's own site. A link, never a request: nothing is fetched until a click.
 */
export function referenceUrl(m: Market): string | null {
	try {
		const url = new URL(m.reference?.url ?? "");
		return url.protocol === "https:" && url.hostname === "polymarket.com" ? url.href : null;
	} catch {
		return null;
	}
}

/** The "All markets" tab a market sits under: the relayers' `category`, else derived. */
export const topic = (m: Market) =>
	m.category ??
	(m.rolling ? "Rolling" : m.plugin === "polymarket" ? "Polymarket" : "Zcash network");

/** A card in the grid: one binary market, or several grouped by their `event`. */
export type Item =
	| { kind: "market"; key: string; market: Market }
	| { kind: "event"; key: string; title: string; markets: Market[] };

/** Groups markets sharing an `event.id` into one item, in order of first appearance. */
export function groupItems(markets: Market[]): Item[] {
	const items: Item[] = [];
	const events = new Map<string, Extract<Item, { kind: "event" }>>();
	for (const m of markets) {
		if (!m.event) {
			items.push({ kind: "market", key: `m${m.id}`, market: m });
			continue;
		}
		const e = events.get(m.event.id);
		if (e) e.markets.push(m);
		else {
			const item = {
				kind: "event" as const,
				key: `e${m.event.id}`,
				title: m.event.title,
				markets: [m],
			};
			events.set(m.event.id, item);
			items.push(item);
		}
	}
	return items;
}

/** The other markets of `m`'s event (itself included), or just `m`. */
export const eventOf = (m: Market, all: Market[]) =>
	m.event ? all.filter((x) => x.event?.id === m.event?.id) : [m];

/** Row label of a market inside an event card, else "Yes". */
export const outcomeLabel = (m: Market) => m.event?.outcome ?? m.question;

/** YES chance in whole percent from the public last price; null before the first cross. */
export const chance = (m: Market) => (m.lastPrice === undefined ? null : Math.round(m.lastPrice));

/** Price in whole cents for one side, from the last price. */
export function sideCents(m: Market, side: Side): number | null {
	const yes = chance(m);
	if (yes === null) return null;
	return side === 0 ? yes : 100 - yes;
}

/** Cents above the last price a default limit sits, so it meets a counterparty near the last price; fills price at the midpoint. */
export const LIMIT_EDGE = 3;

/**
 * Ticket default: the side's last price plus `edge`, clamped to 1..99; 50 with no price yet.
 * A demo self-trade passes edge 0: it fills at its own limit, which becomes the public price,
 * so an edge would walk the price up with every judge's self-trade.
 */
export function defaultPrice(m: Market, side: Side, edge = LIMIT_EDGE): number {
	const last = sideCents(m, side);
	return last === null ? 50 : Math.min(99, Math.max(1, last + edge));
}

export const heightLabel = (h: number) => h.toLocaleString("en-US");

/** Mainnet NU7: 75 s blocks before it, 25 s from it (the relayers' `rolling.fast_from`). */
export const NU7_HEIGHT = 3_543_405;
/** Blocks on top of the resolve block before an outcome counts (`zpredict_oracle::CONFIRMATIONS`). */
export const CONFIRMATIONS = 10;

/** Nominal seconds from `tip` until block `h` is mined; 0 once it is. */
export function secsUntil(tip: number, h: number): number {
	const slow = Math.max(0, Math.min(h, NU7_HEIGHT) - Math.min(tip, NU7_HEIGHT));
	const fast = Math.max(0, h - Math.max(tip, NU7_HEIGHT));
	return slow * 75 + fast * 25;
}

/** "~14 min", "~3 h", "~12 d". */
export function approx(secs: number): string {
	const min = Math.max(1, Math.round(secs / 60));
	if (min < 120) return `~${min} min`;
	const h = Math.round(min / 60);
	return h < 48 ? `~${h} h` : `~${Math.round(h / 24)} d`;
}

export const shortHash = (h: string) => `${h.slice(0, 12)}…${h.slice(-8)}`;
