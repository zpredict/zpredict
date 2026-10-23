"use client";
import type { Market } from "@zpredict/sdk";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { chance, groupItems, type Item, outcomeLabel, topicLine } from "@/lib/markets";
import Glyph from "./Glyph";
import PrivacyChips from "./PrivacyChips";
import ProbabilityBar from "./ProbabilityBar";

const MAX = 5;

/** Featured: grouped events first, then markets that have a price; rolling ones last. */
function pick(markets: Market[]): Item[] {
	const score = (it: Item) =>
		it.kind === "event" ? 0 : it.market.rolling ? 3 : it.market.lastPrice === undefined ? 2 : 1;
	return groupItems(markets.filter((m) => m.status === "open"))
		.sort((a, b) => score(a) - score(b))
		.slice(0, MAX);
}

/** Outcome rows: an event's outcomes, or YES and NO of a binary market. */
function rows(it: Item) {
	if (it.kind === "event")
		return it.markets.map((m) => ({
			key: m.id,
			label: outcomeLabel(m, it.markets),
			pct: chance(m),
			id: m.id,
		}));
	const yes = chance(it.market);
	return [
		{ key: "y", label: "Yes", pct: yes, id: it.market.id },
		{ key: "n", label: "No", pct: yes === null ? null : 100 - yes, id: it.market.id },
	];
}

/**
 * The featured market as a large card with the ASCII mark beside it (the page's LCP, rendered
 * at build time), and prev/next/dot controls. Never auto-advances.
 */
export default function Featured({
	markets,
	visual,
}: {
	markets: Market[] | null;
	visual: ReactNode;
}) {
	const items = pick(markets ?? []);
	const [i, setI] = useState(0);
	const it = items[Math.min(i, items.length - 1)];
	const first = it && (it.kind === "event" ? it.markets[0] : it.market);
	const go = (d: number) => setI((Math.min(i, items.length - 1) + d + items.length) % items.length);

	return (
		<section aria-label="Featured market" aria-roledescription="carousel" className="feat">
			<div className="feat__card">
				<div className="feat__body">
					{it && first ? (
						<>
							<p className="feat__cat">
								<Glyph market={first} /> {topicLine(first)}
							</p>
							<h2 className="feat__title">
								<Link href={`/trade/?m=${first.id}`}>
									{it.kind === "event" ? it.title : first.question}
								</Link>
							</h2>
							<ul className="feat__rows">
								{rows(it).map((r) => (
									<li key={r.key}>
										<Link href={`/trade/?m=${r.id}${r.key === "n" ? "&side=no" : ""}`}>
											{r.label}
										</Link>
										<span className="num">{r.pct === null ? "—" : `${r.pct}%`}</span>
									</li>
								))}
							</ul>
							{it.kind === "market" && <ProbabilityBar yes={chance(it.market)} />}
							<PrivacyChips market={first} />
						</>
					) : (
						<p className="note">{markets ? "No open market right now." : "Loading markets…"}</p>
					)}
				</div>
				<div className="feat__visual">{visual}</div>
			</div>
			{/* Always there (empty while loading), so the controls never push the page down. */}
			<div className="feat__nav">
				{items.length > 1 && (
					<>
						<button aria-label="Previous featured market" onClick={() => go(-1)} type="button">
							←
						</button>
						{items.map((x, k) => (
							<button
								aria-current={k === Math.min(i, items.length - 1)}
								aria-label={`Featured market ${k + 1} of ${items.length}`}
								className="feat__dot"
								key={x.key}
								onClick={() => setI(k)}
								type="button"
							/>
						))}
						<button aria-label="Next featured market" onClick={() => go(1)} type="button">
							→
						</button>
					</>
				)}
			</div>
		</section>
	);
}
