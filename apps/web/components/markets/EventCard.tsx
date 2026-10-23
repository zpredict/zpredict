import type { Market } from "@zpredict/sdk";
import Link from "next/link";
import { chance } from "@/lib/markets";
import CardFoot from "./CardFoot";
import Glyph from "./Glyph";

const ROWS = 3;

/** Several binary markets grouped by `event`: one row per outcome with its chance and Yes/No. */
export default function EventCard({
	title,
	markets,
	tip,
}: {
	title: string;
	markets: Market[];
	tip: number | null;
}) {
	const first = markets[0];
	return (
		<article className="mcard mcard--event">
			<header className="mcard__head">
				<Glyph market={first} />
				<h3 className="mcard__q">
					<Link href={`/trade/?m=${first.id}`}>{title}</Link>
				</h3>
			</header>
			<ul className="mcard__rows">
				{markets.slice(0, ROWS).map((m) => {
					const pct = chance(m);
					return (
						<li className="mcard__row" key={m.id}>
							<Link className="mcard__label" href={`/trade/?m=${m.id}`}>
								{m.event?.outcome ?? m.question}
							</Link>
							<span className="mcard__pct num">{pct === null ? "—" : `${pct}%`}</span>
							<Link
								aria-label={`Buy Yes: ${m.question}`}
								className="chip chip--yes"
								href={`/trade/?m=${m.id}&side=yes`}
							>
								Yes
							</Link>
							<Link
								aria-label={`Buy No: ${m.question}`}
								className="chip chip--no"
								href={`/trade/?m=${m.id}&side=no`}
							>
								No
							</Link>
						</li>
					);
				})}
			</ul>
			<CardFoot market={first} tip={tip} />
		</article>
	);
}
