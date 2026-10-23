"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import JudgeCta from "@/components/judge/JudgeCta";
import AllMarkets from "@/components/markets/AllMarkets";
import ClosingSoon from "@/components/markets/ClosingSoon";
import Featured from "@/components/markets/Featured";
import RelayersDown from "@/components/markets/RelayersDown";
import ResolvedList from "@/components/markets/ResolvedList";
import { useGroupKey } from "@/hooks/useGroupKey";
import { useMarkets } from "@/hooks/useMarkets";
import { useTip } from "@/hooks/useTip";

/**
 * Markets home in Polymarket's layout: featured carousel with the demo CTA and "closing soon"
 * beside it, then all markets by topic, then resolved history. Live from relayer 0.
 */
export default function HomeScreen({ visual }: { visual: ReactNode }) {
	const { markets, down } = useMarkets();
	const tip = useTip();
	const groupKey = useGroupKey();
	const all = markets ?? [];
	return (
		<>
			<div className="home__top">
				<Featured markets={markets} visual={visual} />
				<aside aria-label="Get started" className="home__side">
					<section className="home__cta">
						<h1 className="home__title">
							<span>Bet on Zcash.</span> <span>Without being seen.</span>
						</h1>
						<p className="dim">
							No one learns who bet, which side or how much. Prices are public.{" "}
							<Link href="/threat-model/">Who learns what →</Link>
						</p>
						<JudgeCta />
					</section>
					<ClosingSoon markets={all} tip={tip} />
				</aside>
			</div>
			{down && <RelayersDown />}
			<AllMarkets
				loading={!markets && !down}
				markets={all.filter((m) => m.status !== "resolved")}
				tip={tip}
			/>
			<ResolvedList groupKey={groupKey} markets={all.filter((m) => m.status === "resolved")} />
		</>
	);
}
