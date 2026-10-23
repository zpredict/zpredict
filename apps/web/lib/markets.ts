import type { Market, Side } from "@zpredict/sdk";

/** Category tag per resolver plugin (packages/plugins/*); same labels as the landing. */
const CATEGORIES: Record<string, string> = {
	"nu7-activation": "Network upgrade",
	"ironwood-pool": "Ironwood pool",
	"shielded-actions": "Shielded activity",
};

export const category = (m: Market) =>
	m.rolling ? "Hourly · shielded activity" : (CATEGORIES[m.plugin] ?? m.plugin);

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
