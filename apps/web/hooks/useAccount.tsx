"use client";
// The account: a random tag kept only in this browser (its credential: relayers only ever
// get shares of it), and its balance, combined from the three relayers' XOR balance shares.
import { newTag, type Seat } from "@zpredict/sdk";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { POLL_MS } from "@/lib/config";
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
	refresh: () => Promise<void>;
}

const Ctx = createContext<Account | null>(null);

export function useAccount(): Account {
	const v = useContext(Ctx);
	if (!v) throw new Error("useAccount outside AccountProvider");
	return v;
}

export function AccountProvider({ children }: { children: ReactNode }) {
	const [tag, setTag] = useState<string | null>(null);
	const [balance, setBalance] = useState<bigint | null>(null);
	const [seat, setSeat] = useState<Seat | null>(null);
	const [mock, setMock] = useState<boolean | null>(null);

	useEffect(() => setTag(load(KEYS.tag)), []);

	const refresh = useCallback(async () => {
		if (!tag) return;
		const a = await fetchAccount(tag);
		setBalance(a.balance);
		setSeat(a.seat);
		setMock(a.mock);
	}, [tag]);

	usePoll(refresh, POLL_MS.balance, tag);

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
		<Ctx.Provider value={{ tag, balance, seat, mock, claim, create, forget, restore, refresh }}>
			{children}
		</Ctx.Provider>
	);
}
