// Units → ZEC formatting, and the inline ZEC icon matching the brand file (node --test).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { HALF_TICKS_PER_UNIT, UNIT_ZATS, unitsToZec } from "@zpredict/sdk";
import { units, zec } from "./format.ts";

test("1 unit = 200 half-ticks = 0.01 ZEC, exact", () => {
	assert.equal(zec(HALF_TICKS_PER_UNIT), "0.01");
	assert.equal(zec(25n * HALF_TICKS_PER_UNIT), "0.25");
	assert.equal(zec(5000), "0.25");
	assert.equal(zec(700), "0.035");
	assert.equal(zec(1), "0.00005");
	assert.equal(zec(0), "0.00");
	assert.equal(zec(10_000n * HALF_TICKS_PER_UNIT), "100.00");
	assert.equal(zec(-200), "-0.01");
	assert.equal(units(5000), "25.00");
});

test("agrees with the sdk's deposit amounts (UNIT_ZATS)", () => {
	for (const d of [1, 5, 25] as const) {
		assert.equal(Number(zec(BigInt(d) * HALF_TICKS_PER_UNIT)), Number(unitsToZec(d)));
		assert.equal(BigInt(d) * HALF_TICKS_PER_UNIT * 5_000n, BigInt(d) * UNIT_ZATS);
	}
});

test("the inline icon draws the same shapes as packages/brand/zec/zec.svg", () => {
	const svg = readFileSync(new URL("../../../packages/brand/zec/zec.svg", import.meta.url), "utf8");
	const src = readFileSync(new URL("../components/ui/ZecIcon.tsx", import.meta.url), "utf8");
	const path = svg.match(/<path[^>]* d="([^"]+)"/)?.[1];
	const fill = svg.match(/<circle[^>]* fill="([^"]+)"/)?.[1];
	assert.ok(path && fill);
	assert.ok(src.includes(`"${path}"`), "path differs");
	assert.ok(src.includes(`"${fill}"`), "fill differs");
});
