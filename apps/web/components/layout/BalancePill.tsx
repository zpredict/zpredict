"use client";
import { useAccount } from "@/hooks/useAccount";
import { units } from "@/lib/format";

/** The demo account's balance, combined in this browser from three XOR shares. */
export default function BalancePill() {
	const { tag, balance } = useAccount();
	if (!tag) return null;
	return (
		<p className="balance" title="Combined in your browser from three XOR balance shares">
			<span className="balance__k">Balance</span>
			<span className="balance__v num">{balance === null ? "…" : units(balance)}</span>
		</p>
	);
}
