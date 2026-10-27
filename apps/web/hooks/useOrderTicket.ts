"use client";
import type { Market, Side } from "@zpredict/sdk";
import { useState } from "react";
import { zec } from "@/lib/format";
import { defaultPrice, sideCents } from "@/lib/markets";
import { PAYOUT, quote, zecToHalfTicks } from "@/lib/ticket";
import { useAccount } from "./useAccount";
import { useOrders } from "./useOrders";

interface Check {
	seat: string | null;
	price: number;
	amount: number;
	shares: number;
	each: number;
	/** Worst case, half-ticks: the self-trade pair's. */
	worst: number;
	balance: bigint | null;
}

/** Why the ticket can't be sent, or "". */
function ticketProblem({ seat, price, amount, shares, each, worst, balance }: Check): string {
	if (seat === "waiting")
		return "The relayers' balance table is full, so this account's orders can't fill until a row frees up.";
	if (!Number.isInteger(price) || price < 1 || price > 99) return "Limit price is 1–99¢.";
	if (!(amount > 0)) return "Enter an amount in ZEC.";
	if (shares === 0) return `One share at ${price}¢ costs ${zec(each)} ZEC: enter at least that.`;
	if (balance === null) return "";
	if (BigInt(zecToHalfTicks(amount)) > balance)
		return `That is more than your balance of ${zec(balance)} ZEC.`;
	return BigInt(worst) > balance
		? `The pair's worst-case cost, ${zec(worst)} ZEC, is more than your balance.`
		: "";
}

/**
 * Order ticket state, validation and submit for one market. The trader enters a ZEC amount;
 * it buys whole shares at the limit price, which starts at or just above the public last price
 * for the chosen side (see defaultPrice) and follows the side.
 */
export function useOrderTicket(market: Market, initialSide: Side = 0) {
	const { tag, balance, seat } = useAccount();
	const { place } = useOrders();
	const [side, setSideState] = useState<Side>(initialSide);
	const [price, setPrice] = useState(() => defaultPrice(market, initialSide));
	const [amount, setAmount] = useState(0.01);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	// Demo counterparty (#103), for every account: each order goes out with its exact
	// opposite from the same account, so it fills in the next batch even with nobody else
	// trading (a self-trade with real testnet funds that nets out; the fill is labelled).
	// A self-trade fills at its own limit, which becomes the public price.
	const setSide = (s: Side) => {
		setSideState(s);
		setPrice(defaultPrice(market, s));
	};

	const priced = Number.isInteger(price) && price >= 1 && price <= 99;
	const { each, shares, cost, payout } = priced
		? quote(amount, price)
		: { each: 0, shares: 0, cost: 0, payout: 0 };
	// The pair costs 0.01 ZEC per share whatever the price.
	const worst = shares * PAYOUT;
	const problem = ticketProblem({ seat, price, amount, shares, each, worst, balance });

	/** The most this balance can stake: all of it, or what keeps the pair's cost covered. */
	const max =
		balance === null
			? 0
			: priced
				? Number(zec((balance / BigInt(PAYOUT)) * BigInt(each)))
				: Number(zec(balance));

	const submit = async () => {
		if (problem || !tag) return;
		setBusy(true);
		setError("");
		try {
			await place({ market: market.id, side, price, size: shares });
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
		amount,
		setAmount,
		max,
		shares,
		/** Half-ticks: what the shares cost at the limit, and the pair's worst case. */
		cost,
		worst,
		/** Half-ticks paid if the chosen side wins: 0.01 ZEC per share. */
		payout,
		last: sideCents(market, side),
		busy,
		error: error || problem,
		canSubmit: Boolean(tag) && !problem && !busy,
		hasAccount: Boolean(tag),
		submit,
	};
}
