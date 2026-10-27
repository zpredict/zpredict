"use client";
import { useMemo } from "react";
import { positions } from "@/lib/portfolio";
import { useAccount } from "./useAccount";
import { useMarkets } from "./useMarkets";
import { useOrders } from "./useOrders";

/** Cash (the account balance), holdings and their total, all from this browser. */
export function usePortfolio() {
	const { balance } = useAccount();
	const { orders } = useOrders();
	const { markets } = useMarkets();
	return useMemo(() => {
		const held = positions(orders, markets ?? []);
		// Open holdings only (settled ones are already in the balance); no price yet counts at cost.
		const invested = held.reduce((n, p) => (p.settled ? n : n + (p.value ?? p.cost)), 0);
		const total = balance === null ? null : Number(balance) + invested;
		return { cash: balance, held, invested, total, markets: markets ?? [] };
	}, [balance, orders, markets]);
}
