"use client";
import type { Market } from "@zpredict/sdk";
import { createContext, type ReactNode, useContext, useState } from "react";
import { POLL_MS } from "@/lib/config";
import { fetchMarkets } from "@/lib/relayer";
import { usePoll } from "./usePoll";

interface Markets {
	/** Null until the first read. */
	markets: Market[] | null;
	/** Relayer 0 can't be reached. */
	down: boolean;
}

const Ctx = createContext<Markets | null>(null);

/** One poller of relayer 0's public market list for the whole app. */
export function MarketsProvider({ children }: { children: ReactNode }) {
	const [state, setState] = useState<Markets>({ markets: null, down: false });
	usePoll(async () => {
		try {
			const markets = await fetchMarkets();
			setState({ markets, down: false });
		} catch {
			setState((s) => ({ ...s, down: true }));
		}
	}, POLL_MS.markets);
	return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export function useMarkets(): Markets {
	const v = useContext(Ctx);
	if (!v) throw new Error("useMarkets outside MarketsProvider");
	return v;
}
