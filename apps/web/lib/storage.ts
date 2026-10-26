import { viewDigest } from "@zpredict/sdk";

// localStorage can throw (private mode, blocked site data); the app must still work without it.

export function load(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

export function save(key: string, value: string | null) {
	try {
		if (value === null) localStorage.removeItem(key);
		else localStorage.setItem(key, value);
	} catch {
		// storage blocked: the value lives only in memory this session
	}
}

export function loadJson<T>(key: string, fallback: T): T {
	try {
		return JSON.parse(load(key) ?? "") as T;
	} catch {
		return fallback;
	}
}

/**
 * `backup`: set once the account key was copied or saved, so the backup prompt stops.
 * `payouts`: digests of the payout addresses this browser withdrew to (#91).
 */
export const KEYS = {
	tag: "zp.tag",
	orders: "zp.orders",
	backup: "zp.backup",
	payouts: "zp.payouts",
} as const;

// Payout addresses are kept only as digests, so this browser's storage doesn't list them.
// Kept across `forget`: reusing an address links two accounts' withdrawals just the same.
const digest = (address: string) => viewDigest(new TextEncoder().encode(address));
const payouts = () => {
	const v = loadJson<unknown>(KEYS.payouts, []);
	return Array.isArray(v) ? (v as string[]) : [];
};

/** Whether this browser already withdrew to `address`: the relayers would see the reuse. */
export const addressUsed = (address: string) => payouts().includes(digest(address));

export function rememberAddress(address: string) {
	const d = digest(address);
	save(KEYS.payouts, JSON.stringify([d, ...payouts().filter((x) => x !== d)].slice(0, 100)));
}
