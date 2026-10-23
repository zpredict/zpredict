"use client";
// The trader's own orders, kept only in this browser. Pending ones are polled until
// the three fill shares combine into a result.
import type { Fill } from "@zpredict/sdk";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { POLL_MS } from "@/lib/config";
import { fetchFill, type OrderInput, placeOrder, placeWithCounterparty } from "@/lib/relayer";
import { missed } from "@/lib/shares";
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
	/** DEMO (#103): the self-trade counter-order placed with this one. */
	counterId?: string;
	/** DEMO (#103): set on a counter-order, the id of the trader's order it crosses. */
	counterOf?: string;
	/** Pair already retried: either the automatic resubmission, or the pair it replaced. */
	retry?: boolean;
}

interface Orders {
	orders: MyOrder[];
	place: (o: OrderInput, counterparty?: boolean) => Promise<void>;
}

const Ctx = createContext<Orders | null>(null);
const KEEP = 50;

export function useOrders(): Orders {
	const v = useContext(Ctx);
	if (!v) throw new Error("useOrders outside OrdersProvider");
	return v;
}

type Placed = Pick<MyOrder, "orderId" | "batch" | "shares" | "tokens">;
const mine = (o: OrderInput, p: Placed, extra: Partial<MyOrder> = {}): MyOrder => ({
	...o,
	...p,
	...extra,
	at: Date.now(),
	status: "pending",
});

export function OrdersProvider({ children }: { children: ReactNode }) {
	const { tag } = useAccount();
	const [orders, setOrders] = useState<MyOrder[]>([]);
	const retried = useRef(new Set<string>());

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
		async (o: OrderInput, counterparty = false, retry = false) => {
			if (!tag) throw new Error("no account");
			if (!counterparty) {
				const p = await placeOrder(o, tag);
				update((all) => [mine(o, p), ...all]);
				return;
			}
			const { order, counter } = await placeWithCounterparty(o, tag);
			const c: OrderInput = { ...o, side: o.side === 0 ? 1 : 0, price: 100 - o.price };
			update((all) => [
				mine(o, order, { counterId: counter.orderId, retry }),
				mine(c, counter, { counterOf: order.orderId, retry }),
				...all,
			]);
		},
		[tag, update],
	);

	// A batch boundary between the two posts leaves each order alone in its batch: resubmit
	// the pair once, never after either filled (a partial fill against a trader is real).
	useEffect(() => {
		for (const o of orders) {
			if (!o.counterId || o.retry || !missed(o) || retried.current.has(o.orderId)) continue;
			const c = orders.find((x) => x.orderId === o.counterId);
			if (!c || !missed(c)) continue;
			retried.current.add(o.orderId);
			const ids = [o.orderId, c.orderId];
			update((all) => all.map((x) => (ids.includes(x.orderId) ? { ...x, retry: true } : x)));
			const { market, side, price, size } = o;
			place({ market, side, price, size }, true, true).catch(() => {
				// unreachable relayers: the pair is already marked retried, so it says "Try again"
			});
		}
	}, [orders, place, update]);

	return <Ctx.Provider value={{ orders, place }}>{children}</Ctx.Provider>;
}
