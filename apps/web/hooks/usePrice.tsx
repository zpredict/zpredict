"use client";
import type { Price } from "@zpredict/sdk";
import { createContext, type ReactNode, useContext, useState } from "react";
import { POLL_MS } from "@/lib/config";
import { fetchPrice } from "@/lib/relayer";
import { usePoll } from "./usePoll";

const PriceContext = createContext<Price | null>(null);

/** ZEC/USD from relayer 0, polled once for the whole app; null until it answers. */
export function PriceProvider({ children }: { children: ReactNode }) {
	const [price, setPrice] = useState<Price | null>(null);
	usePoll(async () => setPrice(await fetchPrice()), POLL_MS.price);
	return <PriceContext.Provider value={price}>{children}</PriceContext.Provider>;
}

export const usePrice = () => useContext(PriceContext);
