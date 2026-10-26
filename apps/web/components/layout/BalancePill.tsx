"use client";
import Link from "next/link";
import Amount, { USD_NOTE } from "@/components/ui/Amount";
import { useAccount } from "@/hooks/useAccount";
import { usePortfolio } from "@/hooks/usePortfolio";
import { usePrice } from "@/hooks/usePrice";
import { usd, zec } from "@/lib/format";

/** The header's portfolio total (cash + holdings, all from this browser), linking to /portfolio. */
export default function BalancePill() {
	const { tag } = useAccount();
	const { total, cash } = usePortfolio();
	const price = usePrice();
	if (!tag) return null;
	return (
		<Link
			className="balance"
			href="/portfolio/"
			title={[
				cash === null ? "" : `Cash ${zec(cash)} ZEC.`,
				"Combined in your browser from three XOR shares.",
				total !== null && price ? `${usd(total, price.zecUsd)}. ${USD_NOTE}` : "",
			]
				.filter(Boolean)
				.join(" ")}
		>
			<span className="balance__k">Portfolio</span>
			{total === null ? "…" : <Amount halfTicks={total} usd={false} />}
		</Link>
	);
}
