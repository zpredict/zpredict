"use client";
import type { ReactNode } from "react";
import AllMarkets from "@/components/markets/AllMarkets";
import ClosingSoon from "@/components/markets/ClosingSoon";
import Featured from "@/components/markets/Featured";
import RelayersDown from "@/components/markets/RelayersDown";
import ResolvedList from "@/components/markets/ResolvedList";
import { useGroupKey } from "@/hooks/useGroupKey";
import { useMarkets } from "@/hooks/useMarkets";
import { useTip } from "@/hooks/useTip";

/**
 * Markets home in Polymarket's layout: featured carousel with "closing soon" beside it (getting
 * started is the header button), then all mirrored markets by topic, then the hourly
 * demo-resolution markets with their history. Live from relayer 0.
 */
export default function HomeScreen({ visual }: { visual: ReactNode }) {
	const { markets, down } = useMarkets();
	const tip = useTip();
	const groupKey = useGroupKey();
	const all = markets ?? [];
	const listed = all.filter((m) => !m.rolling);
	const hourly = all.filter((m) => m.rolling);
	return (
		<>
			<h1 className="sr-only">zPredict markets</h1>
			<div className="home__top">
				<Featured markets={markets && listed} visual={visual} />
				<aside aria-label="Closing soon" className="home__side">
					<ClosingSoon markets={listed} tip={tip} />
				</aside>
			</div>
			{down && <RelayersDown />}
			<AllMarkets
				loading={!markets && !down}
				markets={listed.filter((m) => m.status !== "resolved")}
				tip={tip}
			/>
			<ResolvedList
				groupKey={groupKey}
				markets={listed.filter((m) => m.status === "resolved")}
				title="Resolved"
			/>
			<ResolvedList
				groupKey={groupKey}
				markets={hourly}
				sub="An hourly market on Zcash mainnet block data, so you can watch a market close, resolve and pay out today: the mirrored markets settle only when Polymarket does. Each relayer reads its own node; only outcomes all three agree on are signed, and your browser checks the signature."
				title="Demo resolution"
			/>
		</>
	);
}
