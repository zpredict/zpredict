import type { Market } from "@zpredict/sdk";
import ScrambleHeading from "@/components/ui/ScrambleHeading";
import MarketCard from "./MarketCard";
import RelayersDown from "./RelayersDown";

interface Props {
	markets: Market[] | null;
	down: boolean;
}

/** All markets as cards. Prices are public clearing prices; bettors and sizes are not. */
export default function MarketGrid({ markets, down }: Props) {
	return (
		<section aria-labelledby="markets-title" className="mgrid" id="markets">
			<header className="mgrid__head">
				<ScrambleHeading className="mgrid__title" id="markets-title" lines={["Markets."]} />
				<p className="mgrid__sub">Price public. Participants private.</p>
			</header>
			{down && <RelayersDown />}
			{!markets && !down && <p className="note">Loading markets…</p>}
			<div className="mgrid__cards">
				{markets?.map((m) => (
					<MarketCard key={m.id} market={m} />
				))}
			</div>
		</section>
	);
}
