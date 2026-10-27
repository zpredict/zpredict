import { type Fill, type Side, ZATS_PER_HALF_TICK } from "@zpredict/sdk";

/** Zatoshis to ZEC, exact, at least two decimals and no trailing zeros beyond: "0.25", "0.0001". */
export function zatsToZec(zats: bigint): string {
	const sign = zats < 0n ? "-" : "";
	const abs = zats < 0n ? -zats : zats;
	const frac = (abs % 100_000_000n).toString().padStart(8, "0").replace(/0+$/, "");
	return `${sign}${abs / 100_000_000n}.${frac.padEnd(2, "0")}`;
}

/** Half-ticks to ZEC (200 half-ticks = 0.01 ZEC): "0.25", "0.035", "0.00005". */
export const zec = (halfTicks: bigint | number) =>
	zatsToZec(BigInt(halfTicks) * ZATS_PER_HALF_TICK);

const usdFormat = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
});

/** "≈ $309.34": half-ticks at `zecUsd` dollars per ZEC; "< $0.01" for dust. Display only. */
export function usd(halfTicks: bigint | number, zecUsd: number): string {
	const value = (Number(halfTicks) * Number(ZATS_PER_HALF_TICK) * zecUsd) / 1e8;
	if (value !== 0 && Math.abs(value) < 0.01) return "< $0.01";
	return `≈ ${usdFormat.format(value)}`;
}

/** Average fill price in cents per contract: totalCost (half-ticks) / size / 2. */
export const avgCents = (f: Fill) => (f.size ? f.totalCost / f.size / 2 : 0);

export const sideName = (s: Side) => (s === 0 ? "YES" : "NO");

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
