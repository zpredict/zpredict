import type { Market } from "@zpredict/sdk";
import Link from "next/link";
import { approx, chance, secsUntil } from "@/lib/markets";

const MAX = 5;

/**
 * Where Polymarket ranks "hot topics" by volume, zPredict has no volume to rank by (sizes are
 * private), so this lists open markets by how soon trading closes: the hourly one first. Always
 * rendered, with its height reserved, so loading markets never shifts the page.
 */
export default function ClosingSoon({ markets, tip }: { markets: Market[]; tip: number | null }) {
	const list = markets
		.filter((m) => m.status === "open" && !m.event)
		.sort((a, b) => a.closeHeight - b.closeHeight)
		.slice(0, MAX);
	return (
		<section aria-labelledby="soon-title" className="soon">
			<h2 className="soon__title" id="soon-title">
				Closing soon
			</h2>
			<ol>
				{list.map((m, k) => {
					const pct = chance(m);
					return (
						<li key={m.id}>
							<Link className="soon__row" href={`/trade/?m=${m.id}`}>
								<span className="soon__n num">{k + 1}</span>
								<span className="soon__q">{m.question}</span>
								<span className="soon__meta num">
									{pct === null ? "—" : `${pct}%`}
									{tip !== null && <small>{approx(secsUntil(tip, m.closeHeight))}</small>}
								</span>
							</Link>
						</li>
					);
				})}
			</ol>
		</section>
	);
}
