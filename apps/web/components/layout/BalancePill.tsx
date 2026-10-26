"use client";
import Amount, { USD_NOTE } from "@/components/ui/Amount";
import { useAccount } from "@/hooks/useAccount";
import { usePrice } from "@/hooks/usePrice";
import { usd } from "@/lib/format";

/** The demo account's balance, combined in this browser from three XOR shares. */
export default function BalancePill() {
	const { tag, balance } = useAccount();
	const price = usePrice();
	if (!tag) return null;
	return (
		<p
			className="balance"
			title={[
				"Combined in your browser from three XOR balance shares.",
				balance !== null && price ? `${usd(balance, price.zecUsd)}. ${USD_NOTE}` : "",
			]
				.filter(Boolean)
				.join(" ")}
		>
			<span className="balance__k">Balance</span>
			{balance === null ? "…" : <Amount halfTicks={balance} usd={false} />}
		</p>
	);
}
