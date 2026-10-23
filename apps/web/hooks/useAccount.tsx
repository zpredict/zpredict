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
	/** Judge-mode tag (mock credit): its balance can't be withdrawn as testnet ZEC (#104). */
	judge: boolean;
	balance: bigint | null;
	/** `waiting`: the relayers' table is full, so this account's orders can't fill yet. */
	seat: Seat | null;
	claim: () => Promise<void>;
	/** A fresh tag made in this browser, for a real deposit; never sent anywhere in clear. */
	create: () => string;
	forget: () => void;
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
	const [judge, setJudge] = useState(false);

	useEffect(() => {
		setTag(load(KEYS.tag));
		// Tags from before `own` existed count as judge tags: real deposits hadn't started.
		setJudge(load(KEYS.own) === null);
	}, []);

	const refresh = useCallback(async () => {
		if (!tag) return;
		const a = await fetchAccount(tag);
		setBalance(a.balance);
		setSeat(a.seat);
	}, [tag]);

	usePoll(refresh, POLL_MS.balance, tag);

	// One account per browser: a claim that failed halfway is retried with the same tag,
	// which the relayers accept without a second credit (or a second table row).
	const claim = useCallback(async () => {
		const t = load(KEYS.claim) ?? newTag();
		save(KEYS.claim, t);
		await claimJudge(t);
		save(KEYS.tag, t);
		save(KEYS.own, null);
		save(KEYS.claim, null);
		setTag(t);
		setJudge(true);
	}, []);

	const create = useCallback(() => {
		const t = newTag();
		save(KEYS.tag, t);
		setTag(t);
		save(KEYS.own, "1");
		setJudge(false);
		return t;
	}, []);

	const forget = useCallback(() => {
		save(KEYS.tag, null);
		save(KEYS.own, null);
		save(KEYS.orders, null);
		setTag(null);
		setBalance(null);
		setSeat(null);
	}, []);

	return (
		<Ctx.Provider value={{ tag, balance, seat, judge, claim, create, forget, refresh }}>
			{children}
		</Ctx.Provider>
	);
}
