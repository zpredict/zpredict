import {
	combine,
	decodeFill,
	decodeOrder,
	type Fill,
	fromHex,
	type Order,
	toHex,
	viewDigest,
} from "@zpredict/sdk";

/** All three shares present (sparse arrays come from the relayer views). */
export const complete = (shares: string[]) => [0, 1, 2].every((i) => typeof shares[i] === "string");

/** XOR the three hex shares back together; null until all three arrived. */
export function xorHex(shares: string[]): string | null {
	if (!complete(shares)) return null;
	return toHex(combine(shares.map(fromHex)));
}

export function openOrder(shares: string[]): Order | null {
	const h = xorHex(shares);
	return h ? decodeOrder(fromHex(h)) : null;
}

export function openFill(shares: string[]): Fill | null {
	const h = xorHex(shares);
	return h ? decodeFill(fromHex(h)) : null;
}

/**
 * Settled with nothing filled: batched without a match (a relayer answers `filled` for every
 * batched order, so only the combined record's flag tells), or expired unbatched (`unfilled`).
 */
export const missed = (o: { status: string; fill?: Fill }) =>
	o.status === "unfilled" || o.fill?.filled === false;

/** Digests of every share this browser sent or got back: how it finds its own rows in a view. */
export function digestsOf(orders: { shares?: string[]; fillShares?: string[] }[]) {
	const hex = orders.flatMap((o) => [...(o.shares ?? []), ...(o.fillShares ?? [])]);
	return new Set(hex.map((h) => viewDigest(fromHex(h))));
}

/**
 * The order list to keep: every pending or filled order (each is a live position) and the
 * newest `keep` of the rest, which are history. Newest first, as stored.
 */
export function keepOrders<T extends { status: string; fill?: Fill }>(all: T[], keep: number): T[] {
	let history = 0;
	return all.filter((o) => o.status === "pending" || o.fill?.filled || history++ < keep);
}

/**
 * This tab's list plus orders another tab of the same browser stored meanwhile, newest
 * first, so neither tab's save drops the other's orders. This tab's copy of an order wins.
 */
export function mergeOrders<T extends { orderId: string; at: number }>(
	mine: T[],
	stored: T[],
): T[] {
	const have = new Set(mine.map((o) => o.orderId));
	return [...mine, ...stored.filter((o) => !have.has(o.orderId))].sort((a, b) => b.at - a.at);
}
