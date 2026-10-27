// The deposit memo: the account id and one share of the tag per relayer, each encrypted
// to that relayer only. Mirrors `zpredict_settle::memo` byte for byte;
// packages/settle/testdata/memo-vectors.json pins it.
//
//   0xFF | 0x02 | epk (32) | slot0 | slot1 | slot2, zero after byte 154 (512 bytes)
//   slot_i = ChaCha20-Poly1305(k_i, nonce 0, id u64 LE ‖ s_i), 24-byte ciphertext ‖ 16-byte MAC
//   k_i    = BLAKE2b-256(personal "zPredictMemoKey1", X25519(esk, pk_i) ‖ epk ‖ pk_i)
//   id     = BLAKE2b-64(personal "zPredictAccount1", tag), u64 LE
//   s_i    = BLAKE2b-128(personal "zPredictKeyShare", tag ‖ i) for i = 0, 1; s_2 = tag ⊕ s_0 ⊕ s_1
//
// X25519 is WebCrypto. WebCrypto has neither ChaCha20-Poly1305 nor BLAKE2b, so those come
// from @noble/ciphers and @noble/hashes: audited, zero-dependency, the usual choice.

import { chacha20poly1305 } from "@noble/ciphers/chacha.js";
import { blake2b } from "@noble/hashes/blake2.js";
import { fromHex, random, toHex } from "./bytes.js";

/** A Zcash memo is 512 bytes. */
export const MEMO_LEN = 512;
/** Zatoshis in one unit of collateral (0.01 ZEC). Mirrors `zpredict_settle::UNIT_ZATS`. */
export const UNIT_ZATS = 1_000_000n;
/** The only deposit sizes the relayers credit, in units. Anything else is never credited. */
export const DENOMINATIONS = [1, 5, 25, 100, 500, 2500] as const;
export type Denomination = (typeof DENOMINATIONS)[number];

/** The three relayers' memo public keys (hex64), in relayer order. */
export type MemoKeys = readonly [string, string, string];

/** Tag (credential) length in bytes. */
export const KEY_LEN = 16;
const VERSION = 0x02;
const PREFIX = 2 + 32 + 3 * 40;
const PERSONAL = new TextEncoder().encode("zPredictMemoKey1");
const personal = (s: string) => ({ personalization: new TextEncoder().encode(s) });

/** The account's public label: hex16 of its u64 LE id. Grants nothing without the tag. */
export function accountHex(tag: string): string {
	return toHex(blake2b(bytes(tag, KEY_LEN, "tag"), { dkLen: 8, ...personal("zPredictAccount1") }));
}

/** The three relayers' shares of the tag, the same every time (see the layout above). */
export function keyShares(tag: string): [Uint8Array, Uint8Array, Uint8Array] {
	const t = bytes(tag, KEY_LEN, "tag");
	const s = (i: number) =>
		blake2b(new Uint8Array([...t, i]), { dkLen: KEY_LEN, ...personal("zPredictKeyShare") });
	const [s0, s1] = [s(0), s(1)];
	return [s0, s1, t.map((x, j) => x ^ s0[j] ^ s1[j])];
}
// PKCS#8 header of an X25519 private key: WebCrypto's only way to import raw key bytes.
const PKCS8_X25519 = fromHex("302e020100300506032b656e04220420");
const X25519 = { name: "X25519" } as const;

function bytes(hex: string, n: number, what: string): Uint8Array<ArrayBuffer> {
	const b = new Uint8Array(fromHex(hex));
	if (b.length !== n) throw new RangeError(`${what} must be ${n} bytes`);
	return b;
}

/**
 * The 512-byte memo for a deposit to account `tag` (hex32): relayer i reads the account id
 * and its own share of the tag, never the tag. Pass `esk` only in tests: a fresh one per
 * memo is what keeps the zero nonce safe.
 */
export async function encodeMemo(
	tag: string,
	keys: MemoKeys,
	esk: Uint8Array = random(32),
): Promise<Uint8Array> {
	const id = fromHex(accountHex(tag));
	const shares = keyShares(tag);
	const pks = keys.map((k) => bytes(k, 32, "memo key"));
	const priv = await crypto.subtle.importKey(
		"pkcs8",
		new Uint8Array([...PKCS8_X25519, ...esk]),
		X25519,
		true,
		["deriveBits"],
	);
	const jwk = await crypto.subtle.exportKey("jwk", priv);
	const epk = bytes(base64urlToHex(jwk.x ?? ""), 32, "epk");

	const memo = new Uint8Array(MEMO_LEN);
	memo.set([0xff, VERSION]);
	memo.set(epk, 2);
	for (const [i, pk] of pks.entries()) {
		const pub = await crypto.subtle.importKey("raw", pk, X25519, false, []);
		// Throws on a low-order key (all-zero shared secret), as the relayer would reject it.
		const shared = new Uint8Array(
			await crypto.subtle.deriveBits({ ...X25519, public: pub }, priv, 256),
		);
		const k = blake2b(new Uint8Array([...shared, ...epk, ...pk]), {
			dkLen: 32,
			personalization: PERSONAL,
		});
		const plain = new Uint8Array([...id, ...shares[i]]);
		memo.set(chacha20poly1305(k, new Uint8Array(12)).encrypt(plain), 2 + 32 + 40 * i);
	}
	return memo;
}

/** The memo as a ZIP 321 `memo=` value: base64url, no padding, trailing zeros dropped. */
export function memoParam(memo: Uint8Array): string {
	return btoa(String.fromCharCode(...memo.subarray(0, PREFIX)))
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replace(/=+$/, "");
}

/** `units` of collateral as a ZEC decimal string, e.g. 5 → "0.05". */
export function unitsToZec(units: Denomination): string {
	const zats = BigInt(units) * UNIT_ZATS;
	const frac = (zats % 100_000_000n).toString().padStart(8, "0").replace(/0+$/, "");
	return `${zats / 100_000_000n}${frac ? `.${frac}` : ""}`;
}

/** ZIP 321 payment request a wallet can open: one fixed-denomination note plus the memo. */
export function depositUri(escrow: string, units: Denomination, memo: Uint8Array): string {
	if (!DENOMINATIONS.includes(units)) throw new RangeError("not a deposit denomination");
	return `zcash:${escrow}?amount=${unitsToZec(units)}&memo=${memoParam(memo)}`;
}

/** Most notes one deposit request splits into; past it, deposit in more than one go. */
export const MAX_DEPOSIT_NOTES = 12;

/**
 * Any amount of whole units as deposit denominations, largest first: the fewest notes, each a
 * size the relayers credit. 37 → [25, 5, 5, 1, 1]. Throws past `MAX_DEPOSIT_NOTES`.
 */
export function splitDeposit(units: number): Denomination[] {
	if (!Number.isInteger(units) || units < 1) throw new RangeError("deposit at least 1 unit");
	// Before the loop: a huge float (1e20 - 2500 === 1e20) would never count down.
	if (units > MAX_DEPOSIT_NOTES * DENOMINATIONS[DENOMINATIONS.length - 1])
		throw new RangeError("too many notes for one request");
	const parts: Denomination[] = [];
	let left = units;
	for (const d of [...DENOMINATIONS].reverse()) {
		while (left >= d) {
			parts.push(d);
			left -= d;
		}
	}
	if (parts.length > MAX_DEPOSIT_NOTES) throw new RangeError("too many notes for one request");
	return parts;
}

/**
 * One ZIP 321 request paying several denominations to the escrow in one transaction, each note
 * with its own memo (`address.i`, `amount.i`, `memo.i`). One part is the plain `depositUri`.
 */
export function depositRequest(
	escrow: string,
	parts: readonly { units: Denomination; memo: Uint8Array }[],
): string {
	if (parts.length === 0) throw new RangeError("no deposit parts");
	if (parts.length === 1) return depositUri(escrow, parts[0].units, parts[0].memo);
	const params = parts.map(({ units, memo }, i) => {
		if (!DENOMINATIONS.includes(units)) throw new RangeError("not a deposit denomination");
		const k = i === 0 ? "" : `.${i}`;
		return `address${k}=${escrow}&amount${k}=${unitsToZec(units)}&memo${k}=${memoParam(memo)}`;
	});
	return `zcash:?${params.join("&")}`;
}

function base64urlToHex(s: string): string {
	const bin = atob(s.replaceAll("-", "+").replaceAll("_", "/"));
	return Array.from(bin, (c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
}
