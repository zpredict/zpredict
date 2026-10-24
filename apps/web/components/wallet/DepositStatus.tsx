"use client";
import { useEffect, useState } from "react";
import { useAccount, useBalanceWatch } from "@/hooks/useAccount";
import { units } from "@/lib/format";

/**
 * Live status of a deposit, from the account's balance (combined in this browser from the
 * three relayers' shares). The relayers publish nothing about a deposit before they credit it,
 * so "credited" is the first step this page can see.
 */
export default function DepositStatus() {
	const { balance, seat } = useAccount();
	const [base, setBase] = useState<bigint | null>(null);
	useEffect(() => {
		if (base === null && balance !== null) setBase(balance);
	}, [balance, base]);

	const credited = base !== null && balance !== null && balance > base ? balance - base : null;
	useBalanceWatch(credited === null);
	return (
		<p aria-live="polite" className={`dstatus${credited ? " is-done" : ""}`} role="status">
			{credited
				? `Credited by the three relayers: +${units(credited)} units. You can trade now.`
				: seat === "waiting"
					? "Your deposit is credited but the relayers' table is full: orders fill once a row frees up."
					: "Waiting for your deposit. The relayers credit it after 10 confirmations (about 13 minutes on testnet); this updates by itself."}
		</p>
	);
}
