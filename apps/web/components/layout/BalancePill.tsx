"use client";
import Badge from "@/components/ui/Badge";
import { useAccount } from "@/hooks/useAccount";
import { units } from "@/lib/format";

/** The demo account's balance, combined in this browser from three XOR shares. */
export default function BalancePill() {
	const { tag, balance } = useAccount();
	if (!tag) return null;
	return (
		<Badge title="Combined in your browser from three XOR balance shares">
			<span className="dim">Balance</span>
			<span className="num">{balance === null ? "…" : units(balance)}</span>
		</Badge>
	);
}
