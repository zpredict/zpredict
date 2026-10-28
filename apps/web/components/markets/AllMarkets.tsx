"use client";
import type { Market } from "@zpredict/sdk";
import { useState } from "react";
import { useSaved } from "@/hooks/useSaved";
import { groupItems, type Item, topic } from "@/lib/markets";
import BinaryCard from "./BinaryCard";
import EventCard from "./EventCard";

const GHOSTS = ["a", "b", "c", "d"];
/** The tab of markets saved in this browser; shown once one is saved. */
const SAVED = "Saved";

const itemTopic = (it: Item) => topic(it.kind === "event" ? it.markets[0] : it.market);
const itemText = (it: Item) =>
	(it.kind === "event" ? [it.title, ...it.markets.map((m) => m.question)] : [it.market.question])
		.join(" ")
		.toLowerCase();

/** "All markets": topic tabs from the markets' metadata, a search box, and the card grid. */
export default function AllMarkets({
	markets,
	tip,
	loading,
}: {
	markets: Market[];
	tip: number | null;
	/** Before the first `/markets` answer: placeholder cards hold the grid's height. */
	loading: boolean;
}) {
	const [tab, setTab] = useState("All");
	const [query, setQuery] = useState("");
	const { saved } = useSaved();
	const items = groupItems(markets);
	const counts = new Map<string, number>();
	for (const it of items) counts.set(itemTopic(it), (counts.get(itemTopic(it)) ?? 0) + 1);
	const mine = saved.length > 0 || tab === SAVED ? [SAVED] : [];
	const topics = ["All", ...mine, ...[...counts].sort((a, b) => b[1] - a[1]).map(([t]) => t)];
	const q = query.trim().toLowerCase();
	const inTab = (it: Item) =>
		tab === "All" || (tab === SAVED ? saved.includes(it.key) : itemTopic(it) === tab);
	const shown = items.filter((it) => inTab(it) && (!q || itemText(it).includes(q)));

	return (
		<section aria-labelledby="all-title" className="all" id="markets">
			<header className="all__head">
				<h2 className="all__title" id="all-title">
					All markets
				</h2>
				<label className="all__search">
					<span className="sr-only">Search markets</span>
					<input
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Search markets"
						type="search"
						value={query}
					/>
				</label>
			</header>
			<fieldset className="all__tabs">
				<legend className="sr-only">Topics</legend>
				{topics.map((t) => (
					<button aria-pressed={tab === t} key={t} onClick={() => setTab(t)} type="button">
						{t}
					</button>
				))}
			</fieldset>
			<div className="all__grid">
				{loading &&
					GHOSTS.map((k) => <div aria-hidden="true" className="mcard mcard--ghost" key={k} />)}
				{shown.map((it) =>
					it.kind === "event" ? (
						<EventCard
							itemKey={it.key}
							key={it.key}
							markets={it.markets}
							tip={tip}
							title={it.title}
						/>
					) : (
						<BinaryCard itemKey={it.key} key={it.key} market={it.market} tip={tip} />
					),
				)}
			</div>
			{!loading && shown.length === 0 && (
				<p className="dim">
					{tab === SAVED ? "Nothing saved yet: use the bookmark on a card." : "No market matches."}
				</p>
			)}
		</section>
	);
}
