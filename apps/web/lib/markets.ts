import type { Market, Side } from "@zpredict/sdk";

/** Category tag per resolver plugin (packages/plugins/*); same labels as the landing. */
const CATEGORIES: Record<string, string> = {
	"nu7-activation": "Network upgrade",
	"ironwood-pool": "Ironwood pool",
	"shielded-actions": "Shielded activity",
};

export const category = (m: Market) => CATEGORIES[m.plugin] ?? m.plugin;

/** YES chance in whole percent from the public last price; null before the first cross. */
export const chance = (m: Market) => (m.lastPrice === undefined ? null : Math.round(m.lastPrice));

/** Price in whole cents for one side, from the last price. */
export function sideCents(m: Market, side: Side): number | null {
	const yes = chance(m);
	if (yes === null) return null;
	return side === 0 ? yes : 100 - yes;
}

/** Cents above the last price a default limit sits, so it crosses; fills still price at the midpoint. */
export const LIMIT_EDGE = 3;

/** Ticket default: the side's last price plus LIMIT_EDGE, clamped to 1..99; 50 with no price yet. */
export function defaultPrice(m: Market, side: Side): number {
	const last = sideCents(m, side);
	return last === null ? 50 : Math.min(99, Math.max(1, last + LIMIT_EDGE));
}

export const heightLabel = (h: number) => h.toLocaleString("en-US");
