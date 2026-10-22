"use client";
import { useState } from "react";
import { POLL_MS } from "@/lib/config";
import { fetchGroupKey } from "@/lib/relayer";
import { usePoll } from "./usePoll";

/** The group key outcome signatures verify against; null until all three serve the same one. */
export function useGroupKey() {
	const [key, setKey] = useState<string | null>(null);
	usePoll(async () => setKey(await fetchGroupKey()), POLL_MS.groupKey);
	return key;
}
