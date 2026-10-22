"use client";
import MarketGrid from "@/components/markets/MarketGrid";
import { useMarkets } from "@/hooks/useMarkets";

/** Every market as a card, live from relayer 0. */
export default function HomeScreen() {
	const { markets, down } = useMarkets();
	return <MarketGrid down={down} markets={markets} />;
}
