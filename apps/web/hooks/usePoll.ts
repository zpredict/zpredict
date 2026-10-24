"use client";
import { useEffect, useRef } from "react";
import { jitter } from "@/lib/config";

/**
 * Runs `fn` now and then every `ms` (±50%, random: `jitter`) after it settles; errors are
 * swallowed. `ms` null stops the loop.
 */
export function usePoll(fn: () => unknown, ms: number | null, key: unknown = null) {
	const ref = useRef(fn);
	ref.current = fn;
	// biome-ignore lint/correctness/useExhaustiveDependencies: `key` restarts the loop on purpose
	useEffect(() => {
		if (ms === null) return;
		let live = true;
		let t: ReturnType<typeof setTimeout>;
		const tick = async () => {
			try {
				await ref.current();
			} catch {
				// a failed poll just waits for the next tick
			}
			if (live) t = setTimeout(tick, jitter(ms));
		};
		t = setTimeout(tick, 0);
		return () => {
			live = false;
			clearTimeout(t);
		};
	}, [ms, key]);
}
