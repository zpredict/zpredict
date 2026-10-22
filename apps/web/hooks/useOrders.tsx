"use client";
// The trader's own orders, kept only in this browser. Pending ones are polled until
// the three fill shares combine into a result.
import type { Fill } from "@zpredict/sdk";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { POLL_MS } from "@/lib/config";
import { fetchFill, type OrderInput, placeOrder } from "@/lib/relayer";
import { KEYS, loadJson, save } from "@/lib/storage";
import { useAccount } from "./useAccount";
import { usePoll } from "./usePoll";

export interface MyOrder extends OrderInput {
	orderId: string;
	batch: number;
	at: number;
	status: "pending" | "filled" | "unfilled";
	fill?: Fill;
	/** Share i went to relayer i; only this browser holds all three. */
	shares?: string[];
	/** Relayer i's fill-share read token (absent on orders placed before tokens existed). */
	tokens?: string[];
	fillShares?: string[];
}

interface Orders {
	orders: MyOrder[];
	place: (o: OrderInput) => Promise<MyOrder>;
}

const Ctx = createContext<Orders | null>(null);
const KEEP = 50;

export function useOrders(): Orders {
	const v = useContext(Ctx);
	if (!v) throw new Error("useOrders outside OrdersProvider");
	return v;
}

export function OrdersProvider({ children }: { children: ReactNode }) {
	const { tag } = useAccount();
	const [orders, setOrders] = useState<MyOrder[]>([]);

	// Orders belong to the tag: reload when it changes (forget clears storage).
	useEffect(() => {
		setOrders(tag ? loadJson<MyOrder[]>(KEYS.orders, []) : []);
	}, [tag]);

	const update = useCallback((fn: (all: MyOrder[]) => MyOrder[]) => {
		setOrders((prev) => {
			const next = fn(prev).slice(0, KEEP);
			save(KEYS.orders, JSON.stringify(next));
			return next;
		});
	}, []);

	const pending = orders.filter((o) => o.status === "pending" && o.tokens);

	// No balance read right after a fill: a fill poll followed at once by `/accounts/:id`
	// would let a relayer link the order to the account by timing. The balance poll
	// picks the change up on its own (jittered) schedule.
	usePoll(
		async () => {
			for (const { orderId, tokens = [] } of pending) {
				const r = await fetchFill(orderId, tokens);
				if (r.status === "pending") continue;
				const done = { status: r.status, fill: r.fill, fillShares: r.fillShares };
				update((all) => all.map((o) => (o.orderId === orderId ? { ...o, ...done } : o)));
			}
		},
		POLL_MS.fills,
		pending.map((o) => o.orderId).join(),
	);

	const place = useCallback(
		async (o: OrderInput) => {
			if (!tag) throw new Error("no account");
			const { orderId, batch, shares, tokens } = await placeOrder(o, tag);
			const mine: MyOrder = {
				...o,
				orderId,
				batch,
				shares,
				tokens,
				at: Date.now(),
				status: "pending",
			};
			update((all) => [mine, ...all]);
			return mine;
		},
		[tag, update],
	);

	return <Ctx.Provider value={{ orders, place }}>{children}</Ctx.Provider>;
}
