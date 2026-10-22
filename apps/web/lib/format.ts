import { type Fill, HALF_TICKS_PER_UNIT, type Side } from "@zpredict/sdk";

/** Half-ticks to units of collateral, two decimals. */
export const units = (halfTicks: bigint | number) =>
	(Number(halfTicks) / Number(HALF_TICKS_PER_UNIT)).toFixed(2);

/** Average fill price in cents per contract: totalCost (half-ticks) / size / 2. */
export const avgCents = (f: Fill) => (f.size ? f.totalCost / f.size / 2 : 0);

export const sideName = (s: Side) => (s === 0 ? "YES" : "NO");

/** Worst-case cost of an order in units: size × price cents. */
export const maxCost = (size: number, price: number) => ((size * price) / 100).toFixed(2);

export const shortHex = (h: string, n = 8) => h.slice(0, n);

/** Split hex into 2-char bytes for display. */
export const bytes = (h: string) => h.match(/../g) ?? [];

/** Byte ranges of the 18-byte order layout, for labelling the plaintext. */
export const ORDER_FIELDS = [
	{ name: "market", from: 0, to: 4 },
	{ name: "side", from: 4, to: 5 },
	{ name: "price", from: 5, to: 6 },
	{ name: "size", from: 6, to: 10 },
	{ name: "account", from: 10, to: 18 },
] as const;
