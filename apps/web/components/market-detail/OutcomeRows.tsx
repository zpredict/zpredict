import type { Market } from "@zpredict/sdk";
import Link from "next/link";
import ReferencePrice from "@/components/markets/ReferencePrice";
import { chance, outcomeLabel, sideCents } from "@/lib/markets";

const cents = (c: number | null) => (c === null ? "—" : `${c}¢`);

/** One row per outcome (one for a binary market): chance, and Buy Yes / Buy No into the ticket. */
export default function OutcomeRows({ group, selected }: { group: Market[]; selected: Market }) {
	return (
		<section aria-label="Outcomes" className="orows">
			<div aria-hidden="true" className="orows__head">
				<span>Outcome</span>
				<span>Chance</span>
			</div>
			{group.map((m) => {
				const pct = chance(m);
				const href = (side: string) => `/trade/?m=${m.id}&side=${side}`;
				const open = m.status === "open";
				return (
					<div className={`orows__row${m.id === selected.id ? " is-selected" : ""}`} key={m.id}>
						<div className="orows__label">
							<span>{outcomeLabel(m, group)}</span>
							<ReferencePrice market={m} />
						</div>
						<span className="orows__pct num">{pct === null ? "—" : `${pct}%`}</span>
						{open ? (
							<div className="orows__buy">
								<Link className="price price--yes" href={href("yes")} scroll={false}>
									Buy Yes <strong className="num">{cents(sideCents(m, 0))}</strong>
								</Link>
								<Link className="price price--no" href={href("no")} scroll={false}>
									Buy No <strong className="num">{cents(sideCents(m, 1))}</strong>
								</Link>
							</div>
						) : (
							<span className="orows__closed">
								{m.outcome ? `Resolved ${m.outcome}` : m.status}
							</span>
						)}
					</div>
				);
			})}
		</section>
	);
}
