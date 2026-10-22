"use client";
import MarketGrid from "@/components/markets/MarketGrid";
import { useMarkets } from "@/hooks/useMarkets";
import HeroPane from "./HeroPane";
import ShowcasePane from "./ShowcasePane";

/** Home: the hero split with a featured market, then every market as a card. */
export default function HomeScreen() {
	const { markets, down } = useMarkets();
	const featured = markets?.find((m) => m.status === "open");
	return (
		<>
			<main className="panel split split--home">
				<HeroPane />
				<ShowcasePane featured={featured} />
			</main>
			<MarketGrid down={down} markets={markets} />
		</>
	);
}
