import { Suspense } from "react";
import TradeScreen from "@/components/trade/TradeScreen";

export default function TradePage() {
	return (
		<Suspense>
			<TradeScreen />
		</Suspense>
	);
}
