"use client";
// Streams `/view` from each relayer: exactly what that relayer sees.
import type { ViewItem } from "@zpredict/sdk";
import { useRef, useState } from "react";
import { POLL_MS } from "@/lib/config";
import { fetchView } from "@/lib/relayer";
import { usePoll } from "./usePoll";

/** Share hex each relayer saw for one orderId, indexed by relayer. */
export interface Seen {
	order: string[];
	fill: string[];
}

const SEEN_CAP = 1000;

function index(prev: Record<string, Seen>, got: ViewItem[][]) {
	const next = { ...prev };
	got.forEach((items, i) => {
		for (const it of items) {
			const s = next[it.orderId] ?? { order: [], fill: [] };
			const copy = { order: [...s.order], fill: [...s.fill] };
			copy[it.kind][i] = it.share;
			next[it.orderId] = copy;
		}
	});
	const ids = Object.keys(next);
	for (const id of ids.slice(0, Math.max(0, ids.length - SEEN_CAP))) delete next[id];
	return next;
}

/**
 * `views[i]`: the latest items relayer i received.
 * `seen`: shares indexed by orderId, so the trader can XOR their own back together.
 */
export function useRelayerView(keep = 40) {
	const [views, setViews] = useState<ViewItem[][]>([[], [], []]);
	const [seen, setSeen] = useState<Record<string, Seen>>({});
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
		setSeen((prev) => index(prev, got));
	}, POLL_MS.view);

	return { views, seen, online };
}
