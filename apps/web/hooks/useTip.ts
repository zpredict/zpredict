"use client";
import { useState } from "react";
import { POLL_MS } from "@/lib/config";
import { fetchHealth } from "@/lib/relayer";
import { usePoll } from "./usePoll";

/** Mainnet tip height as relayer 0 last saw it; null while unknown. */
export function useTip() {
	const [tip, setTip] = useState<number | null>(null);
	usePoll(async () => {
		const h = (await fetchHealth(0)).height;
		setTip(h > 0 ? h : null);
	}, POLL_MS.health);
	return tip;
}
