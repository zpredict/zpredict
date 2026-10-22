"use client";
import { MAX_SIZE, type Market, type Side } from "@zpredict/sdk";
import { useState } from "react";
import { maxCost } from "@/lib/format";
import { defaultPrice, sideCents } from "@/lib/markets";
import { useAccount } from "./useAccount";
import { useOrders } from "./useOrders";

const isInt = (v: number, lo: number, hi: number) => Number.isInteger(v) && v >= lo && v <= hi;

/**
 * Order ticket state, validation and submit for one market. The limit price starts just above
 * the public last price for the chosen side (see defaultPrice) and follows the side.
 */
export function useOrderTicket(market: Market, initialSide: Side = 0) {
	const { tag, balance } = useAccount();
	const { place } = useOrders();
	const [side, setSideState] = useState<Side>(initialSide);
	const [price, setPrice] = useState(() => defaultPrice(market, initialSide));
	const [size, setSize] = useState(5);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");

	const setSide = (s: Side) => {
		setSideState(s);
		setPrice(defaultPrice(market, s));
	};

	const cost = maxCost(size, price);
	const affordable = balance === null || BigInt(size * price * 2) <= balance;
	const valid = isInt(price, 1, 99) && isInt(size, 1, MAX_SIZE);
	const problem = !valid
		? "Price 1–99¢, size a whole number of contracts"
		: !affordable
			? "Worst-case cost exceeds your balance"
			: "";

	const submit = async () => {
		if (problem || !tag) return;
		setBusy(true);
		setError("");
		try {
			await place({ market: market.id, side, price, size });
		} catch {
			setError("Could not reach all three relayers. A partial order never opens and is dropped.");
		} finally {
			setBusy(false);
		}
	};

	return {
		side,
		setSide,
		price,
		setPrice,
		size,
		setSize,
		cost,
		last: sideCents(market, side),
		payout: size.toFixed(2),
		busy,
		error: error || problem,
		canSubmit: Boolean(tag) && !problem && !busy,
		hasAccount: Boolean(tag),
		submit,
	};
}
