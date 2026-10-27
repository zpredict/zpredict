"use client";
import { accountHex } from "@zpredict/sdk";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { detect, EMPTY, type Inbox, type Note, readAll } from "@/lib/notify";
import { positions } from "@/lib/portfolio";
import { KEYS, loadJson, save } from "@/lib/storage";
import { useAccount } from "./useAccount";
import { useMarkets } from "./useMarkets";
import { useOrders } from "./useOrders";

type Permission = NotificationPermission | "unsupported";

interface Notifications {
	notes: Note[];
	unread: number;
	markRead: () => void;
	/** System notifications: shown while the app is open in a background tab. */
	permission: Permission;
	enableSystem: () => Promise<void>;
}

const Ctx = createContext<Notifications | null>(null);

/** The inbox in storage belongs to one account: another account's is ignored. */
interface Stored {
	account: string;
	inbox: Inbox;
}

const supported = () => typeof window !== "undefined" && "Notification" in window;

/** Shows `notes` as system notifications, only while this tab is hidden (else the bell has them). */
function showSystem(notes: Note[]) {
	if (!supported() || Notification.permission !== "granted" || !document.hidden) return;
	for (const n of notes) {
		try {
			const x = new Notification(n.title, {
				body: n.body,
				tag: n.id,
				icon: "/white/android-chrome-192x192.png",
			});
			x.onclick = () => {
				window.focus();
				location.assign(n.href);
				x.close();
			};
		} catch {
			// some mobile browsers allow notifications only from a service worker: the bell has it
		}
	}
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
	const { tag, balance } = useAccount();
	const { orders } = useOrders();
	const { markets } = useMarkets();
	const account = tag ? accountHex(tag) : null;
	// Keyed by account: until the inbox of the current account is loaded, nothing is checked,
	// so a switch never baselines (and saves) one account's events over another's inbox.
	const [state, setState] = useState<Stored | null>(null);
	const inbox = state?.account === account ? state.inbox : EMPTY;
	const [permission, setPermission] = useState<Permission>("unsupported");

	useEffect(() => {
		if (!account) return setState(null);
		const s = loadJson<Stored | null>(KEYS.notes, null);
		setState({ account, inbox: s?.account === account ? s.inbox : EMPTY });
	}, [account]);
	useEffect(() => setPermission(supported() ? Notification.permission : "unsupported"), []);

	const keep = useCallback(
		(next: Inbox) => {
			if (!account) return;
			setState({ account, inbox: next });
			save(KEYS.notes, JSON.stringify({ account, inbox: next } satisfies Stored));
		},
		[account],
	);

	// Waits for the markets and the balance, so the first check is a full baseline.
	useEffect(() => {
		if (!account || state?.account !== account || markets === null || balance === null) return;
		const held = positions(orders, markets);
		const r = detect(inbox, { orders, markets, held, balance, now: Date.now() });
		if (r.inbox === inbox) return;
		keep(r.inbox);
		showSystem(r.fresh);
	}, [account, state, orders, markets, balance, inbox, keep]);

	const value = useMemo<Notifications>(
		() => ({
			notes: inbox.notes,
			unread: inbox.notes.filter((n) => !n.read).length,
			markRead: () => {
				const next = readAll(inbox);
				if (next !== inbox) keep(next);
			},
			permission,
			enableSystem: async () => {
				if (!supported()) return;
				setPermission(await Notification.requestPermission());
			},
		}),
		[inbox, keep, permission],
	);
	return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNotifications(): Notifications {
	const v = useContext(Ctx);
	if (!v) throw new Error("useNotifications outside NotificationsProvider");
	return v;
}
