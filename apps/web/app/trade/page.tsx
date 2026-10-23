import { Suspense } from "react";
import DetailScreen from "@/components/market-detail/DetailScreen";
import TradeIntro from "@/components/trade/TradeIntro";

export default function TradePage() {
	return (
		<main className="detail">
			<TradeIntro />
			<Suspense>
				<DetailScreen />
			</Suspense>
		</main>
	);
}
