"use client";
import { useSyncExternalStore } from "react";
import { savedStore } from "@/lib/saved";

/** The keys this browser saved; `toggle` adds or removes one. */
export function useSaved() {
	const saved = useSyncExternalStore(
		savedStore.subscribe,
		savedStore.snapshot,
		savedStore.serverSnapshot,
	);
	return { saved, toggle: savedStore.toggle };
}
