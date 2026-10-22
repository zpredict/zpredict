import type { Market } from "@zpredict/sdk";
import Link from "next/link";
import { category } from "@/lib/markets";
import OutcomeProof from "./OutcomeProof";

/** History: resolved markets, newest block first, each with its outcome proof. */
export default function ResolvedList({
	markets,
	groupKey,
}: {
	markets: Market[];
	groupKey: string | null;
}) {
	if (markets.length === 0) return null;
	const list = [...markets].sort((a, b) => (b.blockHeight ?? 0) - (a.blockHeight ?? 0));
	return (
		<section aria-labelledby="resolved-title" className="resolved">
			<h3 className="resolved__title" id="resolved-title">
				Resolved
			</h3>
			<p className="resolved__sub">
				Each relayer resolves from its own mainnet node; only outcomes all three agree on are
				signed. Your browser checks the signature.
			</p>
			<ol className="resolved__list">
				{list.map((m) => (
					<li className="resolved__item" key={m.id}>
						<span className="resolved__cat">{category(m)}</span>
						<Link className="resolved__q" href={`/trade/?m=${m.id}`}>
							{m.question}
						</Link>
						<OutcomeProof groupKey={groupKey} market={m} />
					</li>
				))}
			</ol>
		</section>
	);
}
