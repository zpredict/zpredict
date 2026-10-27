"use client";
import Link from "next/link";
import { USD_NOTE } from "@/components/ui/Amount";
import { useAccount } from "@/hooks/useAccount";
import { usePortfolio } from "@/hooks/usePortfolio";
import { usePrice } from "@/hooks/usePrice";
import { usd, zec } from "@/lib/format";

/** Header stats, as on Polymarket: portfolio total and cash, both computed in this browser. */
export default function BalancePill() {
	const { tag } = useAccount();
	const { total, cash } = usePortfolio();
	const price = usePrice();
	if (!tag) return null;
	const stat = (label: string, v: bigint | number | null) => (
		<span className="hstat">
			<span className="hstat__k">{label}</span>
			<span
				className="hstat__v num"
				title={v !== null && price ? `${usd(v, price.zecUsd)}. ${USD_NOTE}` : undefined}
			>
				{v === null ? "…" : `${zec(v)} ZEC`}
			</span>
		</span>
	);
	return (
		<Link aria-label="Account and portfolio" className="hstats" href="/portfolio/">
			{stat("Portfolio", total)}
			{stat("Cash", cash)}
		</Link>
	);
}
