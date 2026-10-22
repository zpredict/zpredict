"use client";
import { useEffect, useRef } from "react";

/**
 * Runs `fn` now and then every `ms` (±50%, random) after it settles; errors are swallowed.
 * The jitter keeps a browser's balance, fill and view polls from forming a fixed rhythm a
 * relayer could use to tie them to one another.
 */
export function usePoll(fn: () => unknown, ms: number, key: unknown = null) {
	const ref = useRef(fn);
	ref.current = fn;
	// biome-ignore lint/correctness/useExhaustiveDependencies: `key` restarts the loop on purpose
	useEffect(() => {
		let live = true;
		let t: ReturnType<typeof setTimeout>;
		const tick = async () => {
			try {
				await ref.current();
			} catch {
				// a failed poll just waits for the next tick
			}
			if (live) t = setTimeout(tick, ms * (0.5 + Math.random()));
		};
		t = setTimeout(tick, 0);
		return () => {
			live = false;
			clearTimeout(t);
		};
	}, [ms, key]);
}
