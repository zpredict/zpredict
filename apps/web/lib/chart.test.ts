// Chart math (node --test; Node strips the types).
import assert from "node:assert/strict";
import { test } from "node:test";
import { inRange, seriesOf, timeAt, valueAt, xTicks, yTicks } from "./chart.ts";

const pts = [
	{ t: 100, p: 40 },
	{ t: 200, p: 55 },
	{ t: 300, p: 60 },
];

test("valueAt steps: last price at or before t, null before the first", () => {
	assert.equal(valueAt(pts, 50), null);
	assert.equal(valueAt(pts, 100), 40);
	assert.equal(valueAt(pts, 250), 55);
	assert.equal(valueAt(pts, 999), 60);
});

test("inRange starts the line at the window edge with the last earlier price", () => {
	assert.deepEqual(inRange(pts, 150, 300), [
		{ t: 150, p: 40 },
		{ t: 200, p: 55 },
		{ t: 300, p: 60 },
	]);
	assert.equal(inRange(pts, Number.POSITIVE_INFINITY, 300), pts);
});

test("yTicks pads to tens, at least 20 wide, within 0..100", () => {
	assert.deepEqual(yTicks([40, 60]), { lo: 30, hi: 70, ticks: [30, 40, 50, 60, 70] });
	assert.deepEqual(yTicks([99]).hi, 100);
	assert.deepEqual(yTicks([1]).lo, 0);
	assert.ok(yTicks([50]).hi - yTicks([50]).lo >= 20);
	assert.deepEqual(yTicks([]).ticks, [0, 25, 50, 75, 100]);
});

test("xTicks stays within range and at most ~7 labels at every span", () => {
	const t1 = 1_790_000_000;
	for (const span of [600, 3_600, 6 * 3_600, 86_400, 7 * 86_400, 30 * 86_400, 200 * 86_400]) {
		const ticks = xTicks(t1 - span, t1);
		assert.ok(ticks.length >= 1 && ticks.length <= 8, `span ${span}: ${ticks.length}`);
		assert.ok(ticks.every((k) => k.t >= t1 - span && k.t <= t1));
	}
});

test("prices recorded before relayers kept the time (historyAt 0) stay off the time axis", () => {
	const m = { id: 1, history: [40, 50, 60], historyAt: [0, 0, 1_700_000_000] };
	const [own] = seriesOf([m as never], () => "", true);
	assert.deepEqual(own.points, [{ t: 1_700_000_000, p: 60 }]);
	assert.equal(seriesOf([m as never], () => "", false)[0].points.length, 3);
});

test("timeAt follows the pointer freely on a time axis, clamped, and rounds cross indices", () => {
	assert.equal(timeAt(0.25, 100, 300, true), 150);
	assert.equal(timeAt(-1, 100, 300, true), 100);
	assert.equal(timeAt(2, 100, 300, true), 300);
	assert.equal(timeAt(0.26, 0, 10, false), 3);
});
