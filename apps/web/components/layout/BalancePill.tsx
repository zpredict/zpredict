"use client";
import Amount from "@/components/ui/Amount";
import { useAccount } from "@/hooks/useAccount";

/** The demo account's balance, combined in this browser from three XOR shares. */
export default function BalancePill() {
	const { tag, balance, mock } = useAccount();
	if (!tag) return null;
	return (
		<p
			className="balance"
			title={`${mock ? "Mock judge credit. " : ""}Combined in your browser from three XOR balance shares`}
		>
			<span className="balance__k">Balance</span>
			{balance === null ? "…" : <Amount halfTicks={balance} />}
		</p>
	);
}
