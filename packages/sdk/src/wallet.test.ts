// Withdrawal address checks and account key backup (#134).
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	bech32mDecode,
	decodeUnified,
	encodeUnified,
	RECEIVER,
	withdrawalAddressProblem,
} from "./address.js";
import { exportKey, importKey } from "./backup.js";
import { newTag } from "./index.js";

/** The testnet escrow's Ironwood-only UA, made by the Rust key ceremony (deploy/README.md). */
const ESCROW =
	"utest18yg3cneyjgxxknjm0j9020hmx5jp2wm67qn2p3rfmflct9hwlt363gzl50qeu3ms2u044hq8jzuzkl2tq8xa4m0ukzvlpqgtvu96ffyy";

const orchard = decodeUnified(ESCROW)?.receivers.find((r) => r.typecode === RECEIVER.orchard);
const t20 = { typecode: RECEIVER.p2pkh, data: new Uint8Array(20).fill(7) };
const sapling = { typecode: RECEIVER.sapling, data: new Uint8Array(43).fill(9) };

test("decodes a real testnet UA: one Ironwood receiver, and re-encodes byte for byte", () => {
	const ua = decodeUnified(ESCROW);
	assert.ok(ua && orchard);
	assert.equal(ua.hrp, "utest");
	assert.deepEqual(
		ua.receivers.map((r) => [r.typecode, r.data.length]),
		[[RECEIVER.orchard, 43]],
	);
	assert.equal(encodeUnified("utest", ua.receivers), ESCROW);
});

test("accepts a testnet UA with an Ironwood receiver (with or without Sapling)", () => {
	assert.equal(withdrawalAddressProblem(ESCROW), null);
	assert.equal(withdrawalAddressProblem(`  ${ESCROW}  `), null);
	assert.equal(withdrawalAddressProblem(encodeUnified("utest", [orchard!, sapling])), null);
});

test("refuses transparent, Sapling-only, mainnet, damaged and empty addresses", () => {
	const cases: [string, RegExp][] = [
		["", /Enter/],
		["tmBsTi2xWTjUdEXnuTceL7fecEQKeWaPDJd", /transparent address/],
		["t1Hsc1LR8yKnbbe3twRp88p6vFfC5t7DLbs", /transparent address/],
		[
			"ztestsapling1qqqqqqqqqqqqqqqqqqcguyvaw2vjk4sdyeg0lc970u659lvhqq7t0np6hlup5lusxle75ss7jnk",
			/Sapling/,
		],
		[encodeUnified("utest", [orchard!, t20]), /transparent receiver/],
		[encodeUnified("utest", [sapling]), /no Ironwood/],
		[encodeUnified("u", [orchard!]), /mainnet/],
		[`${ESCROW.slice(0, -1)}q`, /Not a valid unified/],
		[ESCROW.slice(0, 40), /Not a valid unified/],
	];
	for (const [addr, why] of cases) assert.match(withdrawalAddressProblem(addr) ?? "ok", why, addr);
});

test("bech32m rejects mixed case and a bad checksum", () => {
	assert.equal(bech32mDecode(ESCROW.toUpperCase())?.hrp, "utest");
	assert.equal(bech32mDecode(`${ESCROW.slice(0, 10)}${ESCROW.slice(10).toUpperCase()}`), null);
});

test("key backup round-trips and catches damage", () => {
	const tag = newTag();
	const key = exportKey(tag);
	assert.match(key, /^zpredict-key-1:[0-9a-f]{32}:[0-9a-f]{8}$/);
	assert.deepEqual(importKey(key), { tag });
	assert.deepEqual(importKey(`  ${key.toUpperCase()}\n`), { tag });
	const flipped = key.replace(/:(.)/, (_, c) => `:${c === "0" ? "1" : "0"}`);
	assert.match((importKey(flipped) as { error: string }).error, /checksum/);
	assert.match((importKey(key.slice(0, -3)) as { error: string }).error, /checksum/);
	assert.match((importKey("hello") as { error: string }).error, /zpredict-key-1/);
	assert.throws(() => exportKey("nope"));
});
