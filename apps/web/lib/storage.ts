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
 * `claim`: a judge tag whose claim hasn't finished, so a retry reuses it (one row).
 * `backup`: set once the account key was copied or saved, so the backup prompt stops.
 */
export const KEYS = {
	tag: "zp.tag",
	orders: "zp.orders",
	claim: "zp.claim",
	backup: "zp.backup",
} as const;
