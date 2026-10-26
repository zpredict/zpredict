"use client";
import { useRouter } from "next/navigation";
import { useAccount } from "./useAccount";

/**
 * The header CTA. No funded account yet: create the tag here (it never leaves this browser
 * in clear) and open the faucet, which sends a real testnet deposit to it. Funded: trade.
 */
export function useStart(market?: number) {
	const { tag, balance, create } = useAccount();
	const router = useRouter();
	const funded = tag !== null && balance !== null && balance > 0n;
	const start = () => {
		if (!tag) create();
		router.push(funded ? (market ? `/trade/?m=${market}` : "/trade/") : "/faucet/");
	};
	return { start, label: funded ? "Trade now" : "Get testnet ZEC" };
}
