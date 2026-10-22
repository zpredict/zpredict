"use client";
import MarketGrid from "@/components/markets/MarketGrid";
import { useMarkets } from "@/hooks/useMarkets";
import Hero from "./Hero";

/** Markets page: the ASCII hero, then every market as a card. */
export default function HomeScreen() {
	const { markets, down } = useMarkets();
	return (
		<main>
			<Hero />
			<MarketGrid down={down} markets={markets} />
		</main>
	);
}
