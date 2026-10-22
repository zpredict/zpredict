"use client";
// Streams `/view` from each relayer: a digest of every share it received, never the share.
import type { ViewItem } from "@zpredict/sdk";
import { useRef, useState } from "react";
import { POLL_MS } from "@/lib/config";
import { fetchView } from "@/lib/relayer";
import { usePoll } from "./usePoll";

/** `views[i]`: the latest items relayer i received. */
export function useRelayerView(keep = 40) {
	const [views, setViews] = useState<ViewItem[][]>([[], [], []]);
	const [online, setOnline] = useState([true, true, true]);
	const cursor = useRef([0, 0, 0]);

	usePoll(async () => {
		const res = await Promise.allSettled([0, 1, 2].map((i) => fetchView(i, cursor.current[i])));
		setOnline(res.map((r) => r.status === "fulfilled"));
		const got = res.map((r) => (r.status === "fulfilled" ? r.value.items : []));
		if (got.every((g) => g.length === 0)) return;
		got.forEach((g, i) => {
			const last = g.at(-1);
			if (last) cursor.current[i] = last.seq;
		});
		setViews((prev) => prev.map((v, i) => [...v, ...got[i]].slice(-keep)));
	}, POLL_MS.view);

	return { views, online };
}
