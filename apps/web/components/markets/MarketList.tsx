"use client";
import { useMarkets } from "@/hooks/useMarkets";
import MarketCard from "./MarketCard";
import RelayersDown from "./RelayersDown";

export default function MarketList() {
	const { markets, down } = useMarkets();
	return (
		<div className="markets">
			{down && <RelayersDown />}
			{!markets && !down && <p className="note">Loading markets…</p>}
			{markets?.map((m) => (
				<MarketCard key={m.id} market={m} />
			))}
		</div>
	);
}
