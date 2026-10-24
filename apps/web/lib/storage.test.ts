// Payout-address reuse is remembered as digests only, and storage failures never throw (#91).
import assert from "node:assert/strict";
import { test } from "node:test";
import { addressUsed, KEYS, load, rememberAddress } from "./storage.ts";

const store = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
	configurable: true,
	value: {
		getItem: (k: string) => store.get(k) ?? null,
		setItem: (k: string, v: string) => store.set(k, v),
		removeItem: (k: string) => store.delete(k),
	},
});

test("a payout address is flagged once used, and stored only as a digest", () => {
	const a = "utest1aaaa";
	assert.equal(addressUsed(a), false);
	rememberAddress(a);
	rememberAddress(a);
	assert.equal(addressUsed(a), true);
	assert.equal(addressUsed("utest1bbbb"), false);
	const raw = load(KEYS.payouts) ?? "";
	assert.ok(!raw.includes(a));
	assert.equal(JSON.parse(raw).length, 1);
});

test("corrupt or blocked storage reads as no history", () => {
	store.set(KEYS.payouts, "{not json");
	assert.equal(addressUsed("utest1aaaa"), false);
	store.set(KEYS.payouts, '"a string"');
	assert.equal(addressUsed("utest1aaaa"), false);
	Object.defineProperty(globalThis, "localStorage", {
		configurable: true,
		get() {
			throw new Error("blocked");
		},
	});
	assert.equal(addressUsed("utest1aaaa"), false);
	rememberAddress("utest1aaaa");
});
