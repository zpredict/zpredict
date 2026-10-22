"use client";
// The demo account: a random tag kept only in this browser, and its balance,
// combined from the three relayers' XOR balance shares.
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { POLL_MS } from "@/lib/config";
import { claimJudge, fetchBalance } from "@/lib/relayer";
import { KEYS, load, save } from "@/lib/storage";
import { usePoll } from "./usePoll";

interface Account {
	tag: string | null;
	balance: bigint | null;
	claim: () => Promise<void>;
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

	useEffect(() => setTag(load(KEYS.tag)), []);

	const refresh = useCallback(async () => {
		if (tag) setBalance(await fetchBalance(tag));
	}, [tag]);

	usePoll(refresh, POLL_MS.balance, tag);

	const claim = useCallback(async () => {
		const r = await claimJudge();
		save(KEYS.tag, r.tag);
		setTag(r.tag);
	}, []);

	const forget = useCallback(() => {
		save(KEYS.tag, null);
		save(KEYS.orders, null);
		setTag(null);
		setBalance(null);
	}, []);

	return <Ctx.Provider value={{ tag, balance, claim, forget, refresh }}>{children}</Ctx.Provider>;
}
