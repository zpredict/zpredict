// Event grouping and row labels (node --test; Node strips the types).
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Market } from "@zpredict/sdk";
import { groupItems, outcomeLabel } from "./markets.ts";

const HOUSE = { id: "house", title: "Which party will win the House in 2026?" };
const m = (id: number, question: string, event?: Market["event"]) =>
	({ id, question, event }) as Market;
const dem = m(
	11,
	"Will the Democratic Party control the House after the 2026 Midterm elections?",
	HOUSE,
);
const rep = m(
	12,
	"Will the Republican Party control the House after the 2026 Midterm elections?",
	HOUSE,
);
const nu7 = m(1, "Will NU7 activate on mainnet at block 3,543,405?");

test("row labels are what differs between an event's questions", () => {
	const all = [nu7, dem, rep];
	assert.equal(outcomeLabel(dem, all), "Democratic");
	assert.equal(outcomeLabel(rep, all), "Republican");
	assert.equal(outcomeLabel(nu7, all), "Yes");
	assert.equal(outcomeLabel(m(3, "Q", { ...HOUSE, outcome: "≥ 5" }), all), "≥ 5");
	assert.equal(outcomeLabel(m(4, "Alone?", { id: "solo", title: "Solo" }), all), "Alone?");
});

test("groupItems keeps first-appearance order and merges an event's markets", () => {
	const items = groupItems([dem, nu7, rep]);
	assert.deepEqual(
		items.map((it) => (it.kind === "event" ? it.markets.map((x) => x.id) : it.market.id)),
		[[11, 12], 1],
	);
});
