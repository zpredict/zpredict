import { Suspense } from "react";
import TradeIntro from "@/components/trade/TradeIntro";
import TradeScreen from "@/components/trade/TradeScreen";

export default function TradePage() {
	return (
		<main className="trade">
			<TradeIntro />
			<Suspense>
				<TradeScreen />
			</Suspense>
		</main>
	);
}
