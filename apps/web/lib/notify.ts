import type { Market } from "@zpredict/sdk";
import type { MyOrder } from "@/hooks/useOrders";
import { avgCents, zec } from "./format.ts";
import type { Position } from "./portfolio";
import { missed } from "./shares.ts";

/**
 * In-app notifications, worked out in this browser from state it already has (its own
 * orders, the public markets, its balance). Nothing extra is fetched and nothing is sent:
 * a push server would learn when this account's orders fill, which is what zPredict hides.
 */
export interface Note {
	/** Stable per event, so one event never notifies twice. */
	id: string;
	at: number;
	title: string;
	body: string;
	href: string;
	read: boolean;
}

export interface Inbox {
	notes: Note[];
	/** Event ids already turned into notes (or present at the baseline). */
	seen: string[];
	/** Half-ticks at the last check, to spot credits; null before the baseline. */
	balance: string | null;
}

export const EMPTY: Inbox = { notes: [], seen: [], balance: null };
const KEEP_NOTES = 30;
const KEEP_SEEN = 400;

interface State {
	orders: MyOrder[];
	markets: Market[];
	held: Position[];
	balance: bigint;
	now: number;
}

type Event = Omit<Note, "at" | "read">;

const sideName = (s: 0 | 1) => (s === 0 ? "YES" : "NO");

/** The trader's own orders once settled; the self-trade leg settles with its pair. */
function orderEvents(orders: MyOrder[], question: (id: number) => string): Event[] {
	const out: Event[] = [];
	for (const o of orders) {
		if (o.counterOf || o.status === "pending") continue;
		const where = { id: `order:${o.orderId}`, href: `/trade/?m=${o.market}` };
		if (o.fill?.filled)
			out.push({
				...where,
				title: "Order filled",
				body: `${o.fill.size} ${sideName(o.fill.side)} at ${avgCents(o.fill).toFixed(1)}¢ · ${question(o.market)}`,
			});
		else if (missed(o))
			out.push({
				...where,
				title: "Order not filled",
				body: `No match before it expired; nothing was spent · ${question(o.market)}`,
			});
	}
	return out;
}

/** Resolved markets the trader holds a side of (not the self-trade hedge). */
function resolutionEvents(held: Position[], byId: Map<number, Market>): Event[] {
	return held.flatMap((p) => {
		const m = byId.get(p.market);
		if (p.hedged || m?.status !== "resolved" || !m.outcome) return [];
		const pays = p.value ? `pay ${zec(p.value)} ZEC` : "pay nothing";
		return [
			{
				id: `resolved:${p.market}:${p.side}`,
				title: `Resolved ${m.outcome.toUpperCase()}`,
				body: `Your ${sideName(p.side)} shares ${pays} · ${m.question}`,
				href: "/portfolio/",
			},
		];
	});
}

function events({ orders, markets, held }: State): Event[] {
	const byId = new Map(markets.map((m) => [m.id, m]));
	const question = (id: number) => byId.get(id)?.question ?? `Market ${id}`;
	return [...orderEvents(orders, question), ...resolutionEvents(held, byId)];
}

/**
 * The inbox after `state`, and the notes that are new. The first call (no balance yet) is a
 * baseline: whatever already happened is marked seen, so opening the app never floods it.
 * Returns `inbox` itself when nothing changed.
 */
export function detect(inbox: Inbox, state: State): { inbox: Inbox; fresh: Note[] } {
	const all = events(state);
	const balance = state.balance.toString();
	if (inbox.balance === null) {
		const seen = [...new Set([...all.map((e) => e.id), ...inbox.seen])].slice(0, KEEP_SEEN);
		return { inbox: { ...inbox, seen, balance }, fresh: [] };
	}
	const seen = new Set(inbox.seen);
	const found = all.filter((e) => !seen.has(e.id));
	const rise = state.balance - BigInt(inbox.balance);
	// A credit with no resolution note this round: a deposit (or a payout seen late).
	if (rise > 0n && !found.some((e) => e.id.startsWith("resolved:")))
		found.push({
			id: `credit:${state.now}:${balance}`,
			title: "Funds credited",
			body: `+${zec(rise)} ZEC in your balance`,
			href: "/portfolio/",
		});
	if (found.length === 0 && balance === inbox.balance) return { inbox, fresh: [] };
	const fresh = found.map((e) => ({ ...e, at: state.now, read: false }));
	return {
		inbox: {
			notes: [...fresh, ...inbox.notes].slice(0, KEEP_NOTES),
			seen: [...found.map((e) => e.id), ...inbox.seen].slice(0, KEEP_SEEN),
			balance,
		},
		fresh,
	};
}

/** Every note read. */
export const readAll = (inbox: Inbox): Inbox =>
	inbox.notes.some((n) => !n.read)
		? { ...inbox, notes: inbox.notes.map((n) => ({ ...n, read: true })) }
		: inbox;
