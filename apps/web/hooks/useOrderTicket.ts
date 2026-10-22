"use client";
import { MAX_SIZE, type Side } from "@zpredict/sdk";
import { useState } from "react";
import { maxCost } from "@/lib/format";
import { useAccount } from "./useAccount";
import { useOrders } from "./useOrders";

const isInt = (v: number, lo: number, hi: number) => Number.isInteger(v) && v >= lo && v <= hi;

/** Order ticket state, validation and submit for one market. */
export function useOrderTicket(market: number) {
	const { tag, balance } = useAccount();
	const { place } = useOrders();
	const [side, setSide] = useState<Side>(0);
	const [price, setPrice] = useState(60);
	const [size, setSize] = useState(5);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");

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
			await place({ market, side, price, size });
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
		payout: size.toFixed(2),
		busy,
		error: error || problem,
		canSubmit: Boolean(tag) && !problem && !busy,
		hasAccount: Boolean(tag),
		submit,
	};
}
