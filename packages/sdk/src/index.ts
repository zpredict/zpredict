// Browser side of zPredict: mirrors `zpredict-core` byte for byte and talks to the
// three relayers. Each relayer only ever receives its own share.

/** Encoded order length in bytes; also the share length. */
export const ORDER_LEN = 18;
/**
 * Fill record length: size u32 LE | totalCost u32 LE | side u8 | flags u8 (bit0 = filled).
 * Summed over every match the order took part in; unfilled orders are all zero.
 */
export const FILL_LEN = 10;
/** Mirrors `zpredict_core::MAX_SIZE`: larger orders are rejected. */
export const MAX_SIZE = 1_000_000;
/** Balance share length: u64 LE in half-ticks. */
export const BALANCE_LEN = 8;
/** Costs and balances are in half-ticks: 1 unit of collateral = 200 half-ticks. */
export const HALF_TICKS_PER_UNIT = 200n;

/** 0 = YES, 1 = NO. */
export type Side = 0 | 1;

export interface Order {
	market: number;
	side: Side;
	/** 1..=99 ticks: the most this order pays per contract for its side. */
	price: number;
	/** Contracts; 0 marks a dummy order. */
	size: number;
	account: bigint;
}

export interface Fill {
	size: number;
	/** Half-ticks paid in total across all matches; average price = totalCost / size / 2 cents. */
	totalCost: number;
	side: Side;
	filled: boolean;
}

const u32 = (x: number) => Number.isInteger(x) && x >= 0 && x <= 0xffffffff;

/** Little-endian layout: market(4) side(1) price(1) size(4) account(8). */
export function encodeOrder(o: Order): Uint8Array {
	if (
		!u32(o.market) ||
		(o.side !== 0 && o.side !== 1) ||
		!Number.isInteger(o.price) ||
		o.price < 1 ||
		o.price > 99 ||
		!u32(o.size) ||
		o.size > MAX_SIZE ||
		o.account < 0n ||
		o.account >= 1n << 64n
	) {
		throw new RangeError("order field out of range");
	}
	const b = new Uint8Array(ORDER_LEN);
	const v = new DataView(b.buffer);
	v.setUint32(0, o.market, true);
	b[4] = o.side;
	b[5] = o.price;
	v.setUint32(6, o.size, true);
	v.setBigUint64(10, o.account, true);
	return b;
}

/** Returns null for anything the circuit would treat as malformed. */
export function decodeOrder(b: Uint8Array): Order | null {
	if (b.length !== ORDER_LEN) throw new RangeError("order must be 18 bytes");
	const v = new DataView(b.buffer, b.byteOffset, b.length);
	const side = b[4];
	const price = b[5];
	const size = v.getUint32(6, true);
	if ((side !== 0 && side !== 1) || price < 1 || price > 99 || size > MAX_SIZE) return null;
	return {
		market: v.getUint32(0, true),
		side,
		price,
		size,
		account: v.getBigUint64(10, true),
	};
}

export function decodeFill(b: Uint8Array): Fill {
	if (b.length !== FILL_LEN) throw new RangeError("fill must be 10 bytes");
	const v = new DataView(b.buffer, b.byteOffset, b.length);
	return {
		size: v.getUint32(0, true),
		totalCost: v.getUint32(4, true),
		side: (b[8] & 1) as Side,
		filled: (b[9] & 1) === 1,
	};
}

/** Balance in half-ticks. */
export function decodeBalance(b: Uint8Array): bigint {
	if (b.length !== BALANCE_LEN) throw new RangeError("balance must be 8 bytes");
	return new DataView(b.buffer, b.byteOffset, b.length).getBigUint64(0, true);
}

export const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

/** Three XOR shares `[r0, r1, b ^ r0 ^ r1]`; pass `r0`, `r1` only in tests. */
export function split(
	b: Uint8Array,
	r0: Uint8Array = random(b.length),
	r1: Uint8Array = random(b.length),
): [Uint8Array, Uint8Array, Uint8Array] {
	return [r0, r1, b.map((x, i) => x ^ r0[i] ^ r1[i])];
}

export function combine(shares: readonly Uint8Array[]): Uint8Array {
	return shares[0].map((_, i) => shares.reduce((x, s) => x ^ s[i], 0));
}

export const toHex = (b: Uint8Array) =>
	Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

// A single character class keeps matching linear (no nested quantifier to backtrack into).
const HEX = /^[0-9a-f]*$/i;

export function fromHex(h: string): Uint8Array {
	if (h.length % 2 !== 0 || !HEX.test(h)) throw new SyntaxError("bad hex");
	return Uint8Array.from(h.match(/../g) ?? [], (x) => Number.parseInt(x, 16));
}

/** A fresh account tag: 16 random bytes, hex. */
export const newTag = () => toHex(random(16));

/** The order's `account` field: first 8 bytes of the tag, little-endian. */
export function tagAccount(tag: string): bigint {
	const b = fromHex(tag);
	if (b.length !== 16) throw new RangeError("tag must be 16 bytes");
	return new DataView(b.buffer).getBigUint64(0, true);
}

// Relayer API (see DESIGN.md "Relayer API"). Hex lengths are in characters.

export interface Health {
	relayer: 0 | 1 | 2;
	height: number;
	batch: number;
	peers: boolean[];
}

export interface Market {
	id: number;
	question: string;
	plugin: string;
	params: Record<string, unknown>;
	closeHeight: number;
	resolveHeight: number;
	status: "open" | "closed" | "resolved";
	outcome?: "yes" | "no";
	outcomeSig?: string;
	/**
	 * Public price: cents per YES contract at the latest cross (the midpoint, so it can end
	 * in .5). Absent until the market's first fill. Sizes and counts are never published.
	 */
	lastPrice?: number;
	/** The last N clearing prices (same unit as `lastPrice`), oldest first, one per batch that crossed. */
	history?: number[];
}

/** `POST /orders`: orderId hex32, share hex36. */
export interface OrderPost {
	orderId: string;
	share: string;
}

/** `202` reply to `POST /orders`. */
export interface OrderAccepted {
	batch: number;
}

/** `GET /orders/:orderId`; fillShare hex20 when filled. */
export interface OrderStatus {
	status: "pending" | "filled" | "unfilled";
	fillShare?: string;
}

/** `GET /accounts/:tag`; balanceShare hex16. */
export interface AccountShare {
	balanceShare: string;
}

export interface ViewItem {
	seq: number;
	kind: "order" | "fill";
	orderId: string;
	share: string;
}

/** `GET /view?after=<seq>`: exactly what this relayer sees. */
export interface View {
	items: ViewItem[];
}

/** `POST /judge/claim`: testnet-only mock credit. */
export interface JudgeClaim {
	tag: string;
}

export type Relayers = readonly [string, string, string];

/** Hosted testnet relayers, one per host. */
export const RELAYERS: Relayers = [
	"https://r0.zpredict.site",
	"https://r1.zpredict.site",
	"https://r2.zpredict.site",
];

async function call<T>(url: string, init?: RequestInit): Promise<T> {
	const r = await fetch(url, {
		...init,
		credentials: "omit",
		referrerPolicy: "no-referrer",
	});
	if (!r.ok) throw new Error(`${r.status} from ${url}`);
	return r.json() as Promise<T>;
}

const at = (base: string, path: string) => base.replace(/\/+$/, "") + path;

/** Refuses to run unless the three relayers are three different origins. */
function distinct(relayers: Relayers) {
	if (new Set(relayers.map((u) => new URL(u).origin)).size !== 3) {
		throw new Error("relayers must be three distinct origins");
	}
}

/** Splits the order and POSTs share i only to relayer i. */
export async function submitOrder(relayers: Relayers, order: Order) {
	distinct(relayers);
	const orderId = toHex(random(16));
	const shares = split(encodeOrder(order));
	const res = await Promise.all(
		shares.map((s, i) =>
			call<OrderAccepted>(at(relayers[i], "/orders"), {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ orderId, share: toHex(s) } satisfies OrderPost),
			}),
		),
	);
	return { orderId, batch: Math.max(...res.map((r) => r.batch)) };
}

export async function getFill(
	relayers: Relayers,
	orderId: string,
): Promise<{ status: OrderStatus["status"]; fill?: Fill }> {
	distinct(relayers);
	const res = await Promise.all(
		relayers.map((u) => call<OrderStatus>(at(u, `/orders/${encodeURIComponent(orderId)}`))),
	);
	if (res.some((r) => r.status === "pending")) return { status: "pending" };
	if (res.every((r) => r.status === "unfilled")) return { status: "unfilled" };
	if (!res.every((r) => r.status === "filled" && r.fillShare)) {
		throw new Error("relayers disagree on the fill");
	}
	const fill = decodeFill(combine(res.map((r) => fromHex(r.fillShare as string))));
	return { status: "filled", fill };
}

/** Balance in half-ticks. */
export async function getBalance(relayers: Relayers, tag: string) {
	distinct(relayers);
	const res = await Promise.all(
		relayers.map((u) => call<AccountShare>(at(u, `/accounts/${encodeURIComponent(tag)}`))),
	);
	return decodeBalance(combine(res.map((r) => fromHex(r.balanceShare))));
}

export const getMarkets = (url: string) => call<Market[]>(at(url, "/markets"));

export const getView = (url: string, after = 0) => call<View>(at(url, `/view?after=${after}`));
