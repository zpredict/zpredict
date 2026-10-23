// The deposit QR decodes back to the exact ZIP 321 request (node --test; types stripped).
import assert from "node:assert/strict";
import { test } from "node:test";
import { depositUri, MEMO_LEN } from "@zpredict/sdk";
import jsQR from "jsqr";
import { qrModules, qrPath } from "./qr.ts";

const ESCROW =
	"utest18yg3cneyjgxxknjm0j9020hmx5jp2wm67qn2p3rfmflct9hwlt363gzl50qeu3ms2u044hq8jzuzkl2tq8xa4m0ukzvlpqgtvu96ffyy";

/** Renders modules to RGBA pixels, `scale` px per module, and decodes them with jsQR. */
function decode(m: boolean[][], scale = 4): string | undefined {
	const n = m.length * scale;
	const px = new Uint8ClampedArray(n * n * 4);
	for (let y = 0; y < n; y++)
		for (let x = 0; x < n; x++) {
			const v = m[Math.floor(y / scale)][Math.floor(x / scale)] ? 0 : 255;
			px.set([v, v, v, 255], (y * n + x) * 4);
		}
	return jsQR(px, n, n)?.data;
}

test("a full deposit request (512-byte memo) round-trips through the QR code", () => {
	const memo = Uint8Array.from({ length: MEMO_LEN }, (_, i) => (i * 37 + 11) & 255);
	for (const units of [1, 5, 25] as const) {
		const uri = depositUri(ESCROW, units, memo);
		assert.ok(uri.startsWith(`zcash:${ESCROW}?`), uri.slice(0, 40));
		assert.equal(decode(qrModules(uri)), uri);
	}
});

test("the quiet zone is light and the SVG path covers exactly the dark modules", () => {
	const m = qrModules("zcash:test");
	assert.ok(m[0].every((d) => !d) && m.every((row) => !row[0]));
	const dark = m.flat().filter(Boolean).length;
	const covered = [...qrPath(m).matchAll(/h(\d+)v1/g)].reduce((s, r) => s + Number(r[1]), 0);
	assert.equal(covered, dark);
});
