"use client";
import MarketGrid from "@/components/markets/MarketGrid";
import { useGroupKey } from "@/hooks/useGroupKey";
import { useMarkets } from "@/hooks/useMarkets";
import { useTip } from "@/hooks/useTip";

/** Every market, live from relayer 0, with the tip for countdowns and the key for proofs. */
export default function HomeScreen() {
	const { markets, down } = useMarkets();
	return <MarketGrid down={down} groupKey={useGroupKey()} markets={markets} tip={useTip()} />;
}
