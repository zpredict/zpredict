"use client";
import ZecIcon from "@/components/ui/ZecIcon";
import { useAccount } from "@/hooks/useAccount";
import { units, zec } from "@/lib/format";

/** The demo account's balance, combined in this browser from three XOR shares. */
export default function BalancePill() {
	const { tag, balance, mock } = useAccount();
	if (!tag) return null;
	return (
		<p
			className="balance"
			title={`${balance === null ? "" : `${units(balance)} units = ${zec(balance)} ZEC${mock ? " (mock judge credit)" : ""}. `}Combined in your browser from three XOR balance shares`}
		>
			<span className="balance__k">Balance</span>
			<ZecIcon />
			<span className="balance__v num">{balance === null ? "…" : units(balance)}</span>
			{balance !== null && <span className="balance__zec num">· {zec(balance)} ZEC</span>}
		</p>
	);
}
