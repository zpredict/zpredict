// Price-chart math: series from public clearing prices, ranges, ticks, labels. No React.
import type { Market } from "@zpredict/sdk";

/** `t` is unix seconds when the relayers serve `historyAt`, else the cross's index. */
export interface Point {
	t: number;
	p: number;
}

export type Tone = "lime" | "white" | "grey";

export interface Series {
	key: string;
	label: string;
	tone: Tone;
	points: Point[];
}

export const RANGES = [
	["1H", 3_600],
	["6H", 21_600],
	["1D", 86_400],
	["1W", 604_800],
	["1M", 2_592_000],
	["ALL", Number.POSITIVE_INFINITY],
] as const;
export type Range = (typeof RANGES)[number][0];

/** Whether the market's history has a timestamp per price. */
export const timed = (m: Market) => !!m.history?.length && m.historyAt?.length === m.history.length;

const TONES: Tone[] = ["lime", "white"];

/**
 * One series per market (an event has several), lime then white then grey. Hook for #114: a
 * relayer-served Polymarket reference series would be appended here as one more grey series.
 */
export function seriesOf(markets: Market[], labelOf: (m: Market) => string, useTime: boolean) {
	return markets.map(
		(m, i): Series => ({
			key: String(m.id),
			label: labelOf(m),
			tone: TONES[i] ?? "grey",
			points: (m.history ?? []).map((p, k) => ({ t: useTime ? (m.historyAt?.[k] ?? k) : k, p })),
		}),
	);
}

/** The points inside [end - span, end], led by the last earlier point so the line starts at the edge. */
export function inRange(points: Point[], span: number, end: number): Point[] {
	if (!Number.isFinite(span)) return points;
	const start = end - span;
	const inside = points.filter((x) => x.t >= start);
	const before = points.filter((x) => x.t < start).at(-1);
	return before ? [{ t: start, p: before.p }, ...inside] : inside;
}

/** The step value of a series at time `t` (last price at or before it), or null before its first. */
export function valueAt(points: Point[], t: number): number | null {
	let v: number | null = null;
	for (const x of points) {
		if (x.t > t) break;
		v = x.p;
	}
	return v;
}

/** Y range and dotted-grid ticks in percent: padded, rounded to 10, at least 20 wide. */
export function yTicks(values: number[]): { lo: number; hi: number; ticks: number[] } {
	if (values.length === 0) return { lo: 0, hi: 100, ticks: [0, 25, 50, 75, 100] };
	let lo = Math.max(0, Math.floor((Math.min(...values) - 5) / 10) * 10);
	let hi = Math.min(100, Math.ceil((Math.max(...values) + 5) / 10) * 10);
	while (hi - lo < 20) {
		if (lo > 0) lo -= 10;
		if (hi - lo < 20 && hi < 100) hi += 10;
	}
	const step = hi - lo <= 40 ? 10 : 20;
	const ticks: number[] = [];
	for (let v = lo; v <= hi; v += step) ticks.push(v);
	return { lo, hi, ticks };
}

const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", o);
const MONTH = fmt({ month: "short" });
const DAY = fmt({ month: "short", day: "numeric" });
const HOUR = fmt({ hour: "numeric", minute: "2-digit" });
const FULL = fmt({ month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Crosshair label: "Oct 22, 7:00 PM", or "Cross 12 of 30" without timestamps. */
export const pointLabel = (t: number, useTime: boolean, count: number) =>
	useTime ? FULL.format(t * 1000) : `Cross ${t + 1} of ${count}`;

interface Unit {
	/** Used when the span is longer than this, in seconds. */
	over: number;
	/** Steps of this unit between labels, so there are at most ~7. */
	step: (span: number) => number;
	/** Rounds down to a boundary of this unit. */
	floor: (d: Date) => void;
	/** Moves forward `n` units. */
	add: (d: Date, n: number) => void;
	format: Intl.DateTimeFormat;
}

const minutes = (span: number) => [5, 10, 15, 30, 60].find((m) => span / 60 / m <= 6) ?? 60;

const UNITS: Unit[] = [
	{
		over: 60 * 86_400,
		step: () => 1,
		floor: (d) => {
			d.setHours(0, 0, 0, 0);
			d.setDate(1);
		},
		add: (d, n) => d.setMonth(d.getMonth() + n),
		format: MONTH,
	},
	{
		over: 2 * 86_400,
		step: (span) => Math.ceil(span / 86_400 / 7),
		floor: (d) => d.setHours(0, 0, 0, 0),
		add: (d, n) => d.setDate(d.getDate() + n),
		format: DAY,
	},
	{
		over: 3 * 3_600,
		step: (span) => Math.ceil(span / 3_600 / 7),
		floor: (d) => d.setHours(d.getHours(), 0, 0, 0),
		add: (d, n) => d.setHours(d.getHours() + n),
		format: HOUR,
	},
	{
		over: 0,
		step: minutes,
		floor: (d) => d.setHours(d.getHours(), 0, 0, 0),
		add: (d, n) => d.setMinutes(d.getMinutes() + n),
		format: HOUR,
	},
];

/** X-axis labels at calendar boundaries (months, days, hours or round minutes), at most ~7. */
export function xTicks(t0: number, t1: number): { t: number; label: string }[] {
	const span = t1 - t0;
	const unit = UNITS.find((u) => span > u.over);
	if (!unit) return [];
	const step = unit.step(span);
	const d = new Date(t0 * 1000);
	unit.floor(d);
	const out: { t: number; label: string }[] = [];
	for (; d.getTime() / 1000 <= t1; unit.add(d, step)) {
		const t = d.getTime() / 1000;
		if (t >= t0) out.push({ t, label: unit.format.format(d) });
	}
	return out;
}
