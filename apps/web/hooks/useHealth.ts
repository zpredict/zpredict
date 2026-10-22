"use client";
import type { Health } from "@zpredict/sdk";
import { useState } from "react";
import { POLL_MS } from "@/lib/config";
import { fetchHealth } from "@/lib/relayer";
import { usePoll } from "./usePoll";

/** `/health` of each relayer; null while unknown or unreachable. */
export function useHealth() {
	const [health, setHealth] = useState<(Health | null)[]>([null, null, null]);
	usePoll(async () => {
		const res = await Promise.allSettled([0, 1, 2].map(fetchHealth));
		setHealth(res.map((r) => (r.status === "fulfilled" ? r.value : null)));
	}, POLL_MS.health);
	return health;
}
