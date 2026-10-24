"use client";
// The account: a random tag kept only in this browser (its credential: relayers only ever
// get shares of it), and its balance, combined from the three relayers' XOR balance shares.
import { newTag, type Seat } from "@zpredict/sdk";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { jitter, POLL_MS } from "@/lib/config";
import { claimJudge, fetchAccount } from "@/lib/relayer";
import { KEYS, load, save } from "@/lib/storage";
import { usePoll } from "./usePoll";

interface Account {
	tag: string | null;
	balance: bigint | null;
	/** `waiting`: the relayers' table is full, so this account's orders can't fill yet. */
	seat: Seat | null;
	/** Judge-mode account (the relayers' `mock` flag): never withdrawable (#104). Null until read. */
	mock: boolean | null;
	claim: () => Promise<void>;
	/** A fresh tag made in this browser, for a real deposit; never sent anywhere in clear. */
	create: () => string;
	forget: () => void;
	/** Replaces this browser's account with a restored tag (its orders here are dropped). */
	restore: (tag: string) => void;
	/** Reads the balance now (a user action); never rejects. */
	refresh: () => Promise<void>;
	/** One read after a jittered delay (`POLL_MS.afterBatch`), e.g. once a batch ran. */
	refreshSoon: () => void;
}

const Ctx = createContext<Account | null>(null);

export function useAccount(): Account {
	const v = useContext(Ctx);
	if (!v) throw new Error("useAccount outside AccountProvider");
	return v;
}

/** Polls the balance (jittered) while `on`: only while a deposit or faucet drop is awaited. */
export function useBalanceWatch(on: boolean) {
	const { refresh } = useAccount();
	usePoll(refresh, on ? POLL_MS.balance : null);
}

export function AccountProvider({ children }: { children: ReactNode }) {
	const [tag, setTag] = useState<string | null>(null);
	const [balance, setBalance] = useState<bigint | null>(null);
	const [seat, setSeat] = useState<Seat | null>(null);
	const [mock, setMock] = useState<boolean | null>(null);

	useEffect(() => setTag(load(KEYS.tag)), []);

	const refresh = useCallback(async () => {
		if (!tag) return;
		try {
			const a = await fetchAccount(tag);
			setBalance(a.balance);
			setSeat(a.seat);
			setMock(a.mock);
		} catch {
			// relayers unreachable: keep the last balance until the next read
		}
	}, [tag]);

	// A balance read names the account id, so reads aren't a constant stream (#90): one on
	// load and on window focus, one a jittered while after a batch this browser had an order
	// in (`refreshSoon`), and a poll only while a deposit is awaited (`useBalanceWatch`).
	useEffect(() => {
		const read = () => void refresh();
		read();
		window.addEventListener("focus", read);
		return () => window.removeEventListener("focus", read);
	}, [refresh]);

	// The timer reads whichever account is current when it fires, never a forgotten one.
	const latest = useRef(refresh);
	latest.current = refresh;
	const soon = useRef<ReturnType<typeof setTimeout>>(undefined);
	useEffect(() => () => clearTimeout(soon.current), []);
	const refreshSoon = useCallback(() => {
		if (soon.current) return;
		soon.current = setTimeout(() => {
			soon.current = undefined;
			void latest.current();
		}, jitter(POLL_MS.afterBatch));
	}, []);

	// One account per browser: a claim that failed halfway is retried with the same tag,
	// which the relayers accept without a second credit (or a second table row).
	const claim = useCallback(async () => {
		const t = load(KEYS.claim) ?? newTag();
		save(KEYS.claim, t);
		await claimJudge(t);
		save(KEYS.tag, t);
		save(KEYS.claim, null);
		setTag(t);
		setMock(true);
	}, []);

	const create = useCallback(() => {
		const t = newTag();
		save(KEYS.tag, t);
		save(KEYS.backup, null);
		setTag(t);
		setMock(false);
		return t;
	}, []);

	const restore = useCallback((t: string) => {
		save(KEYS.tag, t);
		save(KEYS.orders, null);
		save(KEYS.backup, "1");
		setTag(t);
		setBalance(null);
		setSeat(null);
		setMock(null);
	}, []);

	const forget = useCallback(() => {
		save(KEYS.tag, null);
		save(KEYS.orders, null);
		save(KEYS.backup, null);
		setTag(null);
		setBalance(null);
		setSeat(null);
		setMock(null);
	}, []);

	return (
		<Ctx.Provider
			value={{ tag, balance, seat, mock, claim, create, forget, restore, refresh, refreshSoon }}
		>
			{children}
		</Ctx.Provider>
	);
}
