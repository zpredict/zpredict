// Withdrawal address checks (#134): a unified address (ZIP 316) for the right network with an
// Ironwood (Orchard-type) receiver and no transparent receiver. The relayers pay only the
// Ironwood receiver (`zpredict_settle::payout::Payout::parse`); the browser refuses more.

import { blake2b } from "@noble/hashes/blake2.js";

const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BECH32M = 0x2bc830a3;

function polymod(values: number[]): number {
	const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
	let chk = 1;
	for (const v of values) {
		const top = chk >>> 25;
		chk = ((chk & 0x1ffffff) << 5) ^ v;
		for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GEN[i];
	}
	return chk >>> 0;
}

const expand = (hrp: string) => [
	...[...hrp].map((c) => c.charCodeAt(0) >> 5),
	0,
	...[...hrp].map((c) => c.charCodeAt(0) & 31),
];

/** Regroups bits; `pad` adds a final partial group (encoding), else it must be zero padding. */
function regroup(data: ArrayLike<number>, from: number, to: number, pad: boolean): number[] | null {
	let acc = 0;
	let bits = 0;
	const out: number[] = [];
	for (let i = 0; i < data.length; i++) {
		acc = (acc << from) | data[i];
		bits += from;
		while (bits >= to) {
			bits -= to;
			out.push((acc >> bits) & ((1 << to) - 1));
		}
		acc &= (1 << bits) - 1;
	}
	if (pad && bits > 0) out.push((acc << (to - bits)) & ((1 << to) - 1));
	else if (!pad && (bits >= from || acc !== 0)) return null;
	return out;
}

/** Bech32m without the 90-character limit (unified addresses are longer). */
export function bech32mDecode(s: string): { hrp: string; bytes: Uint8Array } | null {
	if (s !== s.toLowerCase() && s !== s.toUpperCase()) return null;
	const str = s.toLowerCase();
	const sep = str.lastIndexOf("1");
	if (sep < 1 || sep + 7 > str.length) return null;
	const hrp = str.slice(0, sep);
	const data = [...str.slice(sep + 1)].map((c) => CHARSET.indexOf(c));
	if (data.includes(-1) || polymod([...expand(hrp), ...data]) !== BECH32M) return null;
	const bytes = regroup(data.slice(0, -6), 5, 8, false);
	return bytes ? { hrp, bytes: Uint8Array.from(bytes) } : null;
}

export function bech32mEncode(hrp: string, bytes: Uint8Array): string {
	const data = regroup(bytes, 8, 5, true) as number[];
	const mod = polymod([...expand(hrp), ...data, 0, 0, 0, 0, 0, 0]) ^ BECH32M;
	const check = Array.from({ length: 6 }, (_, i) => (mod >>> (5 * (5 - i))) & 31);
	return `${hrp}1${[...data, ...check].map((d) => CHARSET[d]).join("")}`;
}

const personal = (tag: string, ...rest: number[]) =>
	Uint8Array.from([...new TextEncoder().encode(tag), ...rest]);

const xor = (a: Uint8Array, b: Uint8Array) => a.map((x, i) => x ^ b[i]);

function f4(m: Uint8Array, inverse: boolean): Uint8Array {
	const lL = Math.min(64, Math.floor(m.length / 2));
	const lR = m.length - lL;
	const H = (i: number, u: Uint8Array) =>
		blake2b(u, { dkLen: lL, personalization: personal("UA_F4Jumble_H", i, 0, 0) });
	const G = (i: number, u: Uint8Array) => {
		const out = new Uint8Array(Math.ceil(lR / 64) * 64);
		for (let j = 0; j * 64 < lR; j++)
			out.set(
				blake2b(u, { dkLen: 64, personalization: personal("UA_F4Jumble_G", i, j & 255, j >> 8) }),
				j * 64,
			);
		return out.subarray(0, lR);
	};
	if (!inverse) {
		const a = m.subarray(0, lL);
		const x = xor(m.subarray(lL), G(0, a));
		const y = xor(a, H(0, x));
		const d = xor(x, G(1, y));
		return Uint8Array.from([...xor(y, H(1, d)), ...d]);
	}
	const c = m.subarray(0, lL);
	const d = m.subarray(lL);
	const y = xor(c, H(1, d));
	const x = xor(d, G(1, y));
	const a = xor(y, H(0, x));
	return Uint8Array.from([...a, ...xor(x, G(0, a))]);
}

/** ZIP 316 receiver typecodes. */
export const RECEIVER = { p2pkh: 0, p2sh: 1, sapling: 2, orchard: 3 } as const;

export interface Receiver {
	typecode: number;
	data: Uint8Array;
}

function compactSize(b: Uint8Array, at: number): [number, number] | null {
	const first = b[at];
	if (first === undefined) return null;
	if (first < 0xfd) return [first, at + 1];
	if (first === 0xfd && at + 2 < b.length) return [b[at + 1] | (b[at + 2] << 8), at + 3];
	return null; // larger sizes never occur in an address
}

/** Decodes a unified address into its HRP and receivers, or null if it isn't one. */
export function decodeUnified(ua: string): { hrp: string; receivers: Receiver[] } | null {
	const dec = bech32mDecode(ua.trim());
	if (!dec || dec.bytes.length < 48) return null;
	const raw = f4(dec.bytes, true);
	const pad = new Uint8Array(16);
	pad.set(new TextEncoder().encode(dec.hrp));
	if (!raw.subarray(-16).every((x, i) => x === pad[i])) return null;
	const body = raw.subarray(0, -16);
	const receivers: Receiver[] = [];
	for (let at = 0; at < body.length; ) {
		const t = compactSize(body, at);
		const l = t && compactSize(body, t[1]);
		if (!t || !l || l[1] + l[0] > body.length) return null;
		receivers.push({ typecode: t[0], data: body.slice(l[1], l[1] + l[0]) });
		at = l[1] + l[0];
	}
	return { hrp: dec.hrp, receivers };
}

/** Encodes receivers as a unified address (sorted by typecode, as ZIP 316 requires). */
export function encodeUnified(hrp: string, receivers: Receiver[]): string {
	const body = [...receivers]
		.sort((a, b) => a.typecode - b.typecode)
		.flatMap((r) => [r.typecode, r.data.length, ...r.data]);
	const pad = new Uint8Array(16);
	pad.set(new TextEncoder().encode(hrp));
	return bech32mEncode(hrp, f4(Uint8Array.from([...body, ...pad]), false));
}

export type Network = "test" | "main";
const UA_HRP: Record<Network, string> = { test: "utest", main: "u" };

/**
 * Why `address` can't receive a zPredict withdrawal on `network`, or null if it can: it must
 * be a unified address for that network with an Ironwood receiver and no transparent one.
 */
export function withdrawalAddressProblem(
	address: string,
	network: Network = "test",
): string | null {
	const a = address.trim();
	if (!a) return "Enter a unified address.";
	const lower = a.toLowerCase();
	const other: Network = network === "test" ? "main" : "test";
	if (/^(t1|t3|tm|t2|tex1|textest1)/.test(lower))
		return "That's a transparent address. Withdrawals go only to shielded (Ironwood) receivers.";
	if (/^(zs1|ztestsapling1)/.test(lower))
		return "That's a Sapling address. Use a unified address with an Ironwood (Orchard) receiver.";
	const ua = decodeUnified(a);
	if (!ua) return "Not a valid unified address (check for a typo or a missing character).";
	if (ua.hrp === UA_HRP[other])
		return network === "test"
			? "That's a mainnet address. This demo pays out on testnet (utest1…)."
			: "That's a testnet address.";
	if (ua.hrp !== UA_HRP[network]) return "Not a Zcash unified address.";
	const types = ua.receivers.map((r) => r.typecode);
	if (types.includes(RECEIVER.p2pkh) || types.includes(RECEIVER.p2sh))
		return "This address has a transparent receiver. Use a shielded-only unified address.";
	if (!types.includes(RECEIVER.orchard))
		return "This address has no Ironwood (Orchard) receiver, which payouts need.";
	return null;
}
