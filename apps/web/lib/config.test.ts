// Relayer origins: the onion ones only when the app is opened from a .onion host (#90).
import assert from "node:assert/strict";
import { test } from "node:test";
import { RELAYERS } from "@zpredict/sdk";
import { jitter, pickRelayers } from "./config.ts";

const CLEAR = "https://a.example,https://b.example,https://c.example";
const ONION = "http://aaa.onion, http://bbb.onion ,http://ccc.onion";

test("clearnet relayers unless the page itself is on a .onion host", () => {
	assert.deepEqual(pickRelayers(CLEAR, ONION, "app.zpredict.site"), CLEAR.split(","));
	assert.deepEqual(pickRelayers(CLEAR, ONION, ""), CLEAR.split(","));
	assert.deepEqual(pickRelayers(CLEAR, ONION, "xyz.onion"), [
		"http://aaa.onion",
		"http://bbb.onion",
		"http://ccc.onion",
	]);
});

test("a missing or malformed list falls back, never to fewer than three relayers", () => {
	assert.deepEqual(pickRelayers(CLEAR, undefined, "xyz.onion"), CLEAR.split(","));
	assert.deepEqual(pickRelayers(CLEAR, "http://aaa.onion", "xyz.onion"), CLEAR.split(","));
	assert.equal(pickRelayers(undefined, undefined, "xyz.onion"), RELAYERS);
	assert.equal(pickRelayers("https://a.example,https://b.example", ONION, "x.site"), RELAYERS);
});

test("jitter stays within ±50%", () => {
	for (let i = 0; i < 1000; i++) {
		const v = jitter(1000);
		assert.ok(v >= 500 && v < 1500, String(v));
	}
});
