import { type Fill, HALF_TICKS_PER_UNIT, type Side, ZATS_PER_HALF_TICK } from "@zpredict/sdk";

/** Half-ticks to units of collateral, two decimals. */
export const units = (halfTicks: bigint | number) =>
	(Number(halfTicks) / Number(HALF_TICKS_PER_UNIT)).toFixed(2);

/**
 * Half-ticks to ZEC (1 unit = 200 half-ticks = 0.01 ZEC), exact, at least two decimals and no
 * trailing zeros beyond: "0.25", "0.035", "0.0001".
 */
export function zec(halfTicks: bigint | number): string {
	const zats = BigInt(halfTicks) * ZATS_PER_HALF_TICK;
	const sign = zats < 0n ? "-" : "";
	const abs = zats < 0n ? -zats : zats;
	const frac = (abs % 100_000_000n).toString().padStart(8, "0").replace(/0+$/, "");
	return `${sign}${abs / 100_000_000n}.${frac.padEnd(2, "0")}`;
}

/** Average fill price in cents per contract: totalCost (half-ticks) / size / 2. */
export const avgCents = (f: Fill) => (f.size ? f.totalCost / f.size / 2 : 0);

export const sideName = (s: Side) => (s === 0 ? "YES" : "NO");

export const shortHex = (h: string, n = 8) => h.slice(0, n);

/** Split hex into 2-char bytes for display. */
export const bytes = (h: string) => h.match(/../g) ?? [];

/** Byte ranges of the 26-byte order layout (`ORDER_LEN`), for labelling the plaintext. */
export const ORDER_FIELDS = [
	{ name: "market", from: 0, to: 4 },
	{ name: "side", from: 4, to: 5 },
	{ name: "price", from: 5, to: 6 },
	{ name: "size", from: 6, to: 10 },
	{ name: "key", from: 10, to: 26 },
] as const;
