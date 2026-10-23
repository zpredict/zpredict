"use client";
import { MAX_SIZE, type Market, type Side } from "@zpredict/sdk";
import { useEffect, useState } from "react";
import { maxCost } from "@/lib/format";
import { defaultPrice, sideCents } from "@/lib/markets";
import { useAccount } from "./useAccount";
import { useOrders } from "./useOrders";

const isInt = (v: number, lo: number, hi: number) => Number.isInteger(v) && v >= lo && v <= hi;

/**
 * Order ticket state, validation and submit for one market. The limit price starts at or just above
 * the public last price for the chosen side (see defaultPrice) and follows the side.
 */
export function useOrderTicket(market: Market, initialSide: Side = 0) {
	const { tag, balance, seat, mock } = useAccount();
	const { place } = useOrders();
	const [side, setSideState] = useState<Side>(initialSide);
	const [price, setPrice] = useState(() => defaultPrice(market, initialSide));
	const [size, setSize] = useState(5);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	// DEMO counterparty (#103): offered to judge accounts only, on by default there (a lone
	// judge never fills otherwise); `null` = untouched, so it follows `mock` once that loads.
	const [counterChoice, setCounter] = useState<boolean | null>(null);
	const counterparty = mock === true && (counterChoice ?? true);

	const edge = counterparty ? 0 : undefined;
	const setSide = (s: Side) => {
		setSideState(s);
		setPrice(defaultPrice(market, s, edge));
	};
	// Re-default the limit when the counterparty switches (edge 0 for a self-trade); later
	// price polls must not overwrite what the trader typed, so `market` isn't a dependency.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset only on the toggle
	useEffect(() => setPrice(defaultPrice(market, side, edge)), [counterparty]);

	// With the counterparty the pair costs one unit per contract: size × 200 half-ticks.
	const cost = counterparty ? maxCost(size, 100) : maxCost(size, price);
	const halfTicks = counterparty ? size * 200 : size * price * 2;
	const affordable = balance === null || BigInt(halfTicks) <= balance;
	const valid = isInt(price, 1, 99) && isInt(size, 1, MAX_SIZE);
	const problem =
		seat === "waiting"
			? "The relayers' balance table is full, so this account's orders can't fill until a row frees up."
			: !valid
				? "Price 1–99¢, size a whole number of contracts"
				: !affordable
					? "Worst-case cost exceeds your balance"
					: "";

	const submit = async () => {
		if (problem || !tag) return;
		setBusy(true);
		setError("");
		try {
			await place({ market: market.id, side, price, size }, counterparty);
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
		canCounter: mock === true,
		counterparty,
		setCounter,
		submit,
	};
}
