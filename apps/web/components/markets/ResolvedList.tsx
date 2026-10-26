import type { Market } from "@zpredict/sdk";
import Link from "next/link";
import { category } from "@/lib/markets";
import OutcomeProof from "./OutcomeProof";

const DEFAULT_SUB =
	"Each relayer resolves on its own; only outcomes all three agree on are signed. Your browser checks the signature.";

/** Rows shown before "Show more": the hourly history alone is 24 markets. */
const SHOWN = 5;

/** Resolved markets, newest block first, each with its outcome proof; open ones first, linked to trade. */
export default function ResolvedList({
	markets,
	groupKey,
	title,
	sub = DEFAULT_SUB,
}: {
	markets: Market[];
	groupKey: string | null;
	title: string;
	sub?: string;
}) {
	if (markets.length === 0) return null;
	const id = `resolved-${title.toLowerCase().replace(/\W+/g, "-")}`;
	const row = (m: Market) => (
		<li className="resolved__item" key={m.id}>
			<span className="resolved__cat">{category(m)}</span>
			<Link className="resolved__q" href={`/trade/?m=${m.id}`}>
				{m.question}
			</Link>
			{m.status === "resolved" ? (
				<OutcomeProof groupKey={groupKey} market={m} />
			) : (
				<Link className="resolved__open" href={`/trade/?m=${m.id}`}>
					Open · trade →
				</Link>
			)}
		</li>
	);
	const list = [...markets].sort(
		(a, b) =>
			Number(a.status === "resolved") - Number(b.status === "resolved") ||
			(b.blockHeight ?? 0) - (a.blockHeight ?? 0),
	);
	return (
		<section aria-labelledby={id} className="resolved">
			<h3 className="resolved__title" id={id}>
				{title}
			</h3>
			<p className="resolved__sub">{sub}</p>
			<ol className="resolved__list">{list.slice(0, SHOWN).map(row)}</ol>
			{list.length > SHOWN && (
				<details className="resolved__more">
					<summary>Show {list.length - SHOWN} more</summary>
					<ol className="resolved__list">{list.slice(SHOWN).map(row)}</ol>
				</details>
			)}
		</section>
	);
}
