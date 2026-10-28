import { KEYS, loadJson, save } from "./storage.ts";

/**
 * Saved markets: keys kept in this browser only (nothing is sent). A small external store, so
 * every card and the "Saved" tab share one list, other tabs included (the `storage` event).
 */

/** `list` with `key` added in front, or removed if it was there. */
export const toggleKey = (list: readonly string[], key: string): string[] =>
	list.includes(key) ? list.filter((k) => k !== key) : [key, ...list];

const NONE: string[] = [];
const listeners = new Set<() => void>();
let cache: string[] | null = null;

function read(): string[] {
	const v = loadJson<unknown>(KEYS.saved, NONE);
	return Array.isArray(v) ? v.filter((k): k is string => typeof k === "string") : NONE;
}

export const savedStore = {
	subscribe(fn: () => void) {
		listeners.add(fn);
		const other = (e: StorageEvent) => {
			if (e.key !== KEYS.saved) return;
			cache = null;
			fn();
		};
		window.addEventListener("storage", other);
		return () => {
			listeners.delete(fn);
			window.removeEventListener("storage", other);
		};
	},
	snapshot: (): string[] => {
		cache ??= read();
		return cache;
	},
	/** On the server and before hydration: nothing saved. */
	serverSnapshot: (): string[] => NONE,
	toggle(key: string) {
		cache = toggleKey(savedStore.snapshot(), key);
		save(KEYS.saved, JSON.stringify(cache));
		for (const fn of listeners) fn();
	},
};
