import type { Market } from "@zpredict/sdk";
import ScrambleHeading from "@/components/ui/ScrambleHeading";
import MarketCard from "./MarketCard";
import RelayersDown from "./RelayersDown";
import ResolvedList from "./ResolvedList";

interface Props {
	markets: Market[] | null;
	down: boolean;
	tip: number | null;
	groupKey: string | null;
}

/**
 * Live markets as cards, the hourly rolling ones first; resolved ones below as history.
 * Prices are public clearing prices; bettors and sizes are not.
 */
export default function MarketGrid({ markets, down, tip, groupKey }: Props) {
	const live = (markets ?? [])
		.filter((m) => m.status !== "resolved")
		.sort((a, b) => Number(!!b.rolling) - Number(!!a.rolling));
	const resolved = (markets ?? []).filter((m) => m.status === "resolved");
	return (
		<section aria-labelledby="markets-title" className="mgrid" id="markets">
			<header className="mgrid__head">
				<ScrambleHeading className="mgrid__title" id="markets-title" lines={["Markets."]} />
				<p className="mgrid__sub">Price public. Participants private.</p>
			</header>
			{down && <RelayersDown />}
			{!markets && !down && <p className="note">Loading markets…</p>}
			<div className="mgrid__cards">
				{live.map((m) => (
					<MarketCard key={m.id} market={m} tip={tip} />
				))}
			</div>
			<ResolvedList groupKey={groupKey} markets={resolved} />
		</section>
	);
}
