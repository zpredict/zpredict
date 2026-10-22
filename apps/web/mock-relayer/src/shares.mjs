// Byte helpers: hex, XOR, and three-way XOR sharing.
import { randomBytes } from "node:crypto";

export const hex = (b) => Buffer.from(b).toString("hex");

export const xor = (...bs) =>
	Buffer.from(bs.reduce((a, b) => Uint8Array.from(a, (x, i) => x ^ b[i])));

/** Three XOR shares `[r0, r1, bytes ^ r0 ^ r1]`; share i goes to relayer i only. */
export function split(bytes) {
	const r0 = randomBytes(bytes.length);
	const r1 = randomBytes(bytes.length);
	return [r0, r1, xor(bytes, r0, r1)];
}

export function u64le(n) {
	const b = Buffer.alloc(8);
	b.writeBigUInt64LE(n);
	return b;
}
