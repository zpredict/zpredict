import type { Market } from "@zpredict/sdk";
import Link from "next/link";
import Glyph from "@/components/markets/Glyph";
import { chance, topic } from "@/lib/markets";

const MAX = 4;

/** Other open markets on the same topic (then any), outside this market's event. */
export default function RelatedMarkets({ market, markets }: { market: Market; markets: Market[] }) {
	const others = markets.filter(
		(m) =>
			m.status === "open" &&
			m.id !== market.id &&
			(!market.event || m.event?.id !== market.event.id),
	);
	const list = [
		...others.filter((m) => topic(m) === topic(market)),
		...others.filter((m) => topic(m) !== topic(market)),
	].slice(0, MAX);
	if (list.length === 0) return null;
	return (
		<section aria-labelledby="related-title" className="related">
			<h2 className="related__title" id="related-title">
				Related markets
			</h2>
			<ul>
				{list.map((m) => {
					const pct = chance(m);
					return (
						<li key={m.id}>
							<Link className="related__row" href={`/trade/?m=${m.id}`}>
								<Glyph market={m} />
								<span className="related__q">{m.question}</span>
								<span className="related__pct num">{pct === null ? "—" : `${pct}%`}</span>
							</Link>
						</li>
					);
				})}
			</ul>
		</section>
	);
}
