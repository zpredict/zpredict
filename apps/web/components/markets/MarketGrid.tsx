import type { Market } from "@zpredict/sdk";
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
				<h2 className="mgrid__title" id="markets-title">
					Markets
				</h2>
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
