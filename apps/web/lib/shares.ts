import {
	combine,
	decodeFill,
	decodeOrder,
	type Fill,
	fromHex,
	type Order,
	toHex,
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
