// Browser side of zPredict: mirrors `zpredict-core` byte for byte and talks to the
// three relayers. Each relayer only ever receives its own share.

import { blake2b } from "@noble/hashes/blake2.js";
import { fromHex, random, toHex } from "./bytes.js";
import { at, call, distinct, postEach, type Relayers } from "./http.js";
import { accountHex, KEY_LEN, keyShares, type MemoKeys } from "./memo.js";

export { fromHex, random, toHex } from "./bytes.js";
export type { Relayers } from "./http.js";
export * from "./memo.js";
export * from "./outcome.js";
export * from "./withdraw.js";

/** Encoded order length in bytes; also the share length. */
export const ORDER_LEN = 26;
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
	/** The account's tag (hex32): the credential the circuit matches against its row's key. */
	key: string;
}

export interface Fill {
	size: number;
	/** Half-ticks paid in total across all matches; average price = totalCost / size / 2 cents. */
	totalCost: number;
	side: Side;
	filled: boolean;
}

const u32 = (x: number) => Number.isInteger(x) && x >= 0 && x <= 0xffffffff;

/** Little-endian layout: market(4) side(1) price(1) size(4) key(16). */
export function encodeOrder(o: Order): Uint8Array {
	if (
		!u32(o.market) ||
		(o.side !== 0 && o.side !== 1) ||
		!Number.isInteger(o.price) ||
		o.price < 1 ||
		o.price > 99 ||
		!u32(o.size) ||
		o.size > MAX_SIZE ||
		!/^[0-9a-f]{32}$/.test(o.key)
	) {
		throw new RangeError("order field out of range");
	}
	const b = new Uint8Array(ORDER_LEN);
	const v = new DataView(b.buffer);
	v.setUint32(0, o.market, true);
	b[4] = o.side;
	b[5] = o.price;
	v.setUint32(6, o.size, true);
	b.set(fromHex(o.key), 10);
	return b;
}

/** Returns null for anything the circuit would treat as malformed. */
export function decodeOrder(b: Uint8Array): Order | null {
	if (b.length !== ORDER_LEN) throw new RangeError("order must be 26 bytes");
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
		key: toHex(b.subarray(10, 10 + KEY_LEN)),
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

/** A fresh account tag: 16 random bytes, hex. It is the account's credential: it stays in
 * the browser, and relayers only ever see one share of it or fresh XOR shares. */
export const newTag = () => toHex(random(KEY_LEN));

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
	/** FROST 2-of-3 signature (hex128) over the outcome and block; check with `verifyOutcome`. */
	outcomeSig?: string;
	/** The block the outcome was computed from: display-order hash (hex64) and height. */
	blockHash?: string;
	blockHeight?: number;
	/** Made by the relayers' hourly rolling-market generator. */
	rolling?: boolean;
	/**
	 * Public price: cents per YES contract at the latest cross (the midpoint, so it can end
	 * in .5). Absent until the market's first fill. Sizes and counts are never published.
	 */
	lastPrice?: number;
	/** The last N clearing prices (same unit as `lastPrice`), oldest first, one per batch that crossed. */
	history?: number[];
}

/** `POST /orders`: orderId hex32, share hex52, token hex32 (fresh per order and relayer). */
export interface OrderPost {
	orderId: string;
	share: string;
	token: string;
}

/** `202` reply to `POST /orders`. */
export interface OrderAccepted {
	batch: number;
}

/** `GET /orders/:orderId?token=`; fillShare hex20 when filled. */
export interface OrderStatus {
	status: "pending" | "filled" | "unfilled";
	fillShare?: string;
}

/** `GET /accounts/:id?key=<this relayer's key share>`; balanceShare hex16. */
export interface AccountShare {
	balanceShare: string;
}

/** One share a relayer received, as a digest (`viewDigest`): never the share or orderId. */
export interface ViewItem {
	seq: number;
	kind: "order" | "fill";
	digest: string;
}

/** `GET /view?after=<seq>`: a digest of every share this relayer received. */
export interface View {
	items: ViewItem[];
}

/** `POST /judge/claim` to relayer i: testnet-only mock credit for a new account. */
export interface JudgeClaim {
	/** hex16: the account id, u64 LE. */
	account: string;
	/** hex32: relayer i's share of the tag. */
	keyShare: string;
}

/** Hosted testnet relayers, one per host. */
export const RELAYERS: Relayers = [
	"https://r0.zpredict.site",
	"https://r1.zpredict.site",
	"https://r2.zpredict.site",
];

/**
 * What `GET /view` publishes for a share: BLAKE2b-128 (personal "zPredictViewItem"), hex.
 * The owner holds the share, so it can find it in a relayer's view; nobody else can XOR
 * the three views back together. Mirrors `zpredict_relayer::state::view_digest`.
 */
export const viewDigest = (share: Uint8Array) =>
	toHex(
		blake2b(share, {
			dkLen: 16,
			personalization: new TextEncoder().encode("zPredictViewItem"),
		}),
	);

/**
 * Splits the order and POSTs share i only to relayer i, with a fresh random read token
 * per relayer: every relayer knows the orderId, so only the token stops one relayer from
 * fetching the others' fill shares. Keep `tokens` (and `shares`) to read the fill.
 */
export async function submitOrder(relayers: Relayers, order: Order) {
	distinct(relayers);
	const orderId = toHex(random(16));
	const shares = split(encodeOrder(order)).map(toHex);
	const tokens = shares.map(() => toHex(random(16)));
	const res = await Promise.all(
		shares.map((share, i) =>
			call<OrderAccepted>(at(relayers[i], "/orders"), {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ orderId, share, token: tokens[i] } satisfies OrderPost),
			}),
		),
	);
	return { orderId, batch: Math.max(...res.map((r) => r.batch)), shares, tokens };
}

/** Combines the three fill shares; relayer i answers only to `tokens[i]` from `submitOrder`. */
export async function getFill(
	relayers: Relayers,
	orderId: string,
	tokens: readonly string[],
): Promise<{ status: OrderStatus["status"]; fill?: Fill; fillShares?: string[] }> {
	distinct(relayers);
	const id = encodeURIComponent(orderId);
	const res = await Promise.all(
		relayers.map((u, i) =>
			call<OrderStatus>(at(u, `/orders/${id}?token=${encodeURIComponent(tokens[i] ?? "")}`)),
		),
	);
	if (res.some((r) => r.status === "pending")) return { status: "pending" };
	if (res.every((r) => r.status === "unfilled")) return { status: "unfilled" };
	if (!res.every((r) => r.status === "filled" && r.fillShare)) {
		throw new Error("relayers disagree on the fill");
	}
	const fillShares = res.map((r) => r.fillShare as string);
	const fill = decodeFill(combine(fillShares.map(fromHex)));
	return { status: "filled", fill, fillShares };
}

/** Balance in half-ticks. Each relayer answers only to its own share of the tag. */
export async function getBalance(relayers: Relayers, tag: string) {
	distinct(relayers);
	const [id, shares] = [accountHex(tag), keyShares(tag)];
	const res = await Promise.all(
		relayers.map((u, i) => call<AccountShare>(at(u, `/accounts/${id}?key=${toHex(shares[i])}`))),
	);
	return decodeBalance(combine(res.map((r) => fromHex(r.balanceShare))));
}

/** Judge mode: opens account `tag` with the relayers' mock credit, sending relayer i only
 * its share of the tag (as a deposit memo would). Fails if the account already exists. */
export async function claimJudge(relayers: Relayers, tag: string) {
	distinct(relayers);
	const account = accountHex(tag);
	const bodies = keyShares(tag).map((s): JudgeClaim => ({ account, keyShare: toHex(s) }));
	await postEach(relayers, "/judge/claim", bodies);
}

export const getMarkets = (url: string) => call<Market[]>(at(url, "/markets"));

export const getView = (url: string, after = 0) => call<View>(at(url, `/view?after=${after}`));

/** `GET /memo-key`: the relayer's X25519 public key for its deposit-memo slot. */
export interface MemoKeyReply {
	relayer: 0 | 1 | 2;
	memoKey: string;
}

/** `GET /group-key`: the escrow's FROST group key, which also signs outcomes. */
export interface GroupKeyReply {
	relayer: 0 | 1 | 2;
	groupKey: string;
	threshold: number;
}

/** The group key (hex64), only if all three relayers serve the same one; else null. */
export async function getGroupKey(relayers: Relayers): Promise<string | null> {
	distinct(relayers);
	const res = await Promise.all(relayers.map((u) => call<GroupKeyReply>(at(u, "/group-key"))));
	const key = res[0].groupKey;
	const ok = res.every((r, i) => r.relayer === i && r.groupKey === key);
	return ok && /^[0-9a-f]{64}$/.test(key) ? key : null;
}

/** The three memo keys, each fetched from its own relayer and checked to be in order. */
export async function getMemoKeys(relayers: Relayers): Promise<MemoKeys> {
	distinct(relayers);
	const res = await Promise.all(relayers.map((u) => call<MemoKeyReply>(at(u, "/memo-key"))));
	res.forEach((r, i) => {
		if (r.relayer !== i || !/^[0-9a-f]{64}$/.test(r.memoKey)) {
			throw new Error(`relayer ${i} returned a bad memo key`);
		}
	});
	return [res[0].memoKey, res[1].memoKey, res[2].memoKey];
}
