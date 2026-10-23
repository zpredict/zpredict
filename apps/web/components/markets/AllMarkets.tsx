"use client";
import type { Market } from "@zpredict/sdk";
import { useState } from "react";
import { groupItems, type Item, topic } from "@/lib/markets";
import BinaryCard from "./BinaryCard";
import EventCard from "./EventCard";

const GHOSTS = ["a", "b", "c", "d"];

const itemTopic = (it: Item) => topic(it.kind === "event" ? it.markets[0] : it.market);
const itemText = (it: Item) =>
	(it.kind === "event"
		? [it.title, ...it.markets.map((m) => m.event?.outcome ?? "")]
		: [it.market.question]
	)
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
	const items = groupItems(markets);
	const counts = new Map<string, number>();
	for (const it of items) counts.set(itemTopic(it), (counts.get(itemTopic(it)) ?? 0) + 1);
	const topics = ["All", ...[...counts].sort((a, b) => b[1] - a[1]).map(([t]) => t)];
	const q = query.trim().toLowerCase();
	const shown = items.filter(
		(it) => (tab === "All" || itemTopic(it) === tab) && (!q || itemText(it).includes(q)),
	);

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
						<EventCard key={it.key} markets={it.markets} tip={tip} title={it.title} />
					) : (
						<BinaryCard key={it.key} market={it.market} tip={tip} />
					),
				)}
			</div>
			{!loading && shown.length === 0 && <p className="dim">No market matches.</p>}
		</section>
	);
}
