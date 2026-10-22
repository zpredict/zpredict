"use client";
import type { Market } from "@zpredict/sdk";
import { useState } from "react";
import { POLL_MS } from "@/lib/config";
import { fetchMarkets } from "@/lib/relayer";
import { usePoll } from "./usePoll";

/** Markets from relayer 0; `down` when it can't be reached. */
export function useMarkets() {
	const [markets, setMarkets] = useState<Market[] | null>(null);
	const [down, setDown] = useState(false);
	usePoll(async () => {
		try {
			setMarkets(await fetchMarkets());
			setDown(false);
		} catch {
			setDown(true);
		}
	}, POLL_MS.markets);
	return { markets, down };
}
