// Checks a market's signed outcome: the relayers' FROST 2-of-3 signature is a plain
// RedPallas SpendAuth signature (R ‖ S) over `Resolution::message()` under the escrow's
// group key. Mirrors `zpredict_settle::outcome::verify`; the vectors in
// packages/settle/testdata/outcome-vectors.json pin both.
//
// Verification only touches public data, so plain (variable-time) BigInt arithmetic on
// Pallas is fine here. BLAKE2b comes from @noble/hashes, as for the deposit memo.

import { blake2b } from "@noble/hashes/blake2.js";
import { fromHex } from "./bytes.js";

/** The fields of a resolved market that the signature covers. */
export interface SignedOutcome {
	id: number;
	outcome?: "yes" | "no";
	blockHeight?: number;
	blockHash?: string;
	outcomeSig?: string;
}

/** Mirrors `zpredict_oracle::MESSAGE_PREFIX`. */
const PREFIX = "zPredict outcome v1\n";

/** The signed bytes: prefix, then the compact JSON `zpredict_oracle::Resolution` serializes to. */
export function outcomeMessage(r: {
	market: number;
	outcome: "yes" | "no";
	height: number;
	blockHash: string;
}): Uint8Array {
	const json = JSON.stringify({
		market: r.market,
		outcome: r.outcome,
		height: r.height,
		blockHash: r.blockHash,
	});
	return new TextEncoder().encode(PREFIX + json);
}

/** True iff `m` carries an outcome signed by the group key (hex64) over its block. */
export function verifyOutcome(m: SignedOutcome, groupKey: string): boolean {
	const { outcome, blockHeight, blockHash, outcomeSig } = m;
	if (!outcome || blockHeight === undefined || !blockHash || !outcomeSig) return false;
	try {
		const msg = outcomeMessage({ market: m.id, outcome, height: blockHeight, blockHash });
		return verifySpendAuth(fromHex(groupKey), msg, fromHex(outcomeSig));
	} catch {
		return false;
	}
}

// Pallas: y² = x³ + 5 over F_P, prime order Q.
const P = 0x40000000000000000000000000000000224698fc094cf91b992d30ed00000001n;
const Q = 0x40000000000000000000000000000000224698fc0994a8dd8c46eb2100000001n;
/** Orchard SpendAuthSig basepoint, `hash_to_curve("z.cash:Orchard")("G")` (reddsa). */
const BASE = fromHex("63c975b884721a8d0ca1707be30c7f0c5f445f3e7c188d3b06d6f128b32355b7");
const PERSONAL = new TextEncoder().encode("Zcash_RedPallasH");

const mod = (a: bigint, m = P) => ((a % m) + m) % m;

function pow(base: bigint, exp: bigint, m = P): bigint {
	let [r, b, e] = [1n, mod(base, m), exp];
	for (; e > 0n; e >>= 1n, b = (b * b) % m) if (e & 1n) r = (r * b) % m;
	return r;
}

/** Tonelli–Shanks (P − 1 = 2³² · t); null for a non-residue. */
function sqrt(a: bigint): bigint | null {
	if (a === 0n) return 0n;
	if (pow(a, (P - 1n) / 2n) !== 1n) return null;
	let s = 0n;
	let t = P - 1n;
	for (; !(t & 1n); s++) t >>= 1n;
	let z = 2n;
	while (pow(z, (P - 1n) / 2n) !== P - 1n) z++;
	let [m, c, r, u] = [s, pow(z, t), pow(a, (t + 1n) / 2n), pow(a, t)];
	while (u !== 1n) {
		let i = 0n;
		for (let x = u; x !== 1n; i++) x = (x * x) % P;
		let b = c;
		for (let j = 0n; j < m - i - 1n; j++) b = (b * b) % P;
		[m, c] = [i, (b * b) % P];
		[u, r] = [(u * c) % P, (r * b) % P];
	}
	return r;
}

const le = (b: Uint8Array) => b.reduceRight((acc, x) => (acc << 8n) | BigInt(x), 0n);

/** Jacobian point; null is the identity. */
type Pt = { x: bigint; y: bigint; z: bigint } | null;

/** Zcash encoding: x little-endian, sign of y in bit 255. Rejects the identity. */
function decode(b: Uint8Array): Pt {
	if (b.length !== 32) return null;
	const v = le(b);
	const x = v & ((1n << 255n) - 1n);
	if (x >= P) return null;
	let y = sqrt(mod(x * x * x + 5n));
	if (y === null) return null;
	if ((y & 1n) !== v >> 255n) y = mod(-y);
	return { x, y, z: 1n };
}

function dbl(p: Pt): Pt {
	if (!p || p.y === 0n) return null;
	const a = (p.x * p.x) % P;
	const b = (p.y * p.y) % P;
	const c = (b * b) % P;
	const d = mod(2n * ((p.x + b) ** 2n - a - c));
	const e = 3n * a;
	const x = mod(e * e - 2n * d);
	return { x, y: mod(e * (d - x) - 8n * c), z: mod(2n * p.y * p.z) };
}

function add(p: Pt, q: Pt): Pt {
	if (!p) return q;
	if (!q) return p;
	const [z1z1, z2z2] = [(p.z * p.z) % P, (q.z * q.z) % P];
	const [u1, u2] = [(p.x * z2z2) % P, (q.x * z1z1) % P];
	const s1 = (((p.y * q.z) % P) * z2z2) % P;
	const s2 = (((q.y * p.z) % P) * z1z1) % P;
	const h = mod(u2 - u1);
	const r = mod(2n * (s2 - s1));
	if (h === 0n) return r === 0n ? dbl(p) : null;
	const i = (4n * h * h) % P;
	const j = (h * i) % P;
	const v = (u1 * i) % P;
	const x = mod(r * r - j - 2n * v);
	const y = mod(r * (v - x) - 2n * s1 * j);
	return { x, y, z: mod(((p.z + q.z) ** 2n - z1z1 - z2z2) * h) };
}

function mul(p: Pt, k: bigint): Pt {
	let r: Pt = null;
	for (let i = BigInt(k.toString(2).length) - 1n; i >= 0n; i--) {
		r = dbl(r);
		if ((k >> i) & 1n) r = add(r, p);
	}
	return r;
}

function same(p: Pt, q: Pt): boolean {
	if (!p || !q) return p === q;
	const [pz2, qz2] = [(p.z * p.z) % P, (q.z * q.z) % P];
	return mod(p.x * qz2 - q.x * pz2) === 0n && mod(p.y * qz2 * q.z - q.y * pz2 * p.z) === 0n;
}

/** RedDSA: [S]B = R + [c]vk, c = BLAKE2b-512("Zcash_RedPallasH", R ‖ vk ‖ msg) mod Q. */
function verifySpendAuth(vk: Uint8Array, msg: Uint8Array, sig: Uint8Array): boolean {
	if (sig.length !== 64) return false;
	const [rBytes, sBytes] = [sig.subarray(0, 32), sig.subarray(32)];
	const [key, r] = [decode(vk), decode(rBytes)];
	const s = le(sBytes);
	if (!key || !r || s >= Q) return false;
	const h = blake2b(new Uint8Array([...rBytes, ...vk, ...msg]), {
		dkLen: 64,
		personalization: PERSONAL,
	});
	const c = le(h) % Q;
	return same(mul(decode(BASE), s), add(r, mul(key, c)));
}
