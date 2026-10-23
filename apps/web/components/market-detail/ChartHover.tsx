import { pointLabel, type Series, valueAt } from "@/lib/chart";

interface Props {
	at: number;
	cx: number;
	w: number;
	top: number;
	bottom: number;
	count: number;
	useTime: boolean;
	series: Series[];
	y: (p: number) => number;
}

/** Minimum vertical distance between two big labels, in px. */
const GAP = 46;

/**
 * The crosshair: a vertical line with the time on top, a square marker on every series, and
 * each series' name and price beside it in its colour (flipped left near the right edge).
 */
export default function ChartHover({ at, cx, w, top, bottom, count, useTime, series, y }: Props) {
	const left = cx > w * 0.62;
	const dx = left ? -12 : 12;
	const anchor = left ? "end" : "start";
	const marks = series
		.map((s) => ({ s, v: valueAt(s.points, at) }))
		.filter((m): m is { s: Series; v: number } => m.v !== null)
		.map((m) => ({ ...m, my: y(m.v) }))
		.sort((a, b) => a.my - b.my);
	// Push labels apart top-down so two series never print over each other.
	let floor = top + 20;
	const labelled = marks.map((m) => {
		const ly = Math.max(m.my - 6, floor);
		floor = ly + GAP;
		return { ...m, ly: Math.min(ly, bottom - 6) };
	});
	const time = pointLabel(at, useTime, count);
	const tx = Math.min(Math.max(cx, 60), w - 60);

	return (
		<g className="pchart__hover">
			<line className="pchart__cross" x1={cx} x2={cx} y1={top - 8} y2={bottom} />
			<text className="pchart__time" textAnchor="middle" x={tx} y={top - 14}>
				{time}
			</text>
			{labelled.map(({ s, v, my, ly }) => (
				<g className={`tone-${s.tone}`} key={s.key}>
					<rect className="pchart__dot" height={8} width={8} x={cx - 4} y={my - 4} />
					<text className="pchart__name" textAnchor={anchor} x={cx + dx} y={ly}>
						{s.label}
					</text>
					<text className="pchart__pct" textAnchor={anchor} x={cx + dx} y={ly + 30}>
						{Math.round(v)}%
					</text>
				</g>
			))}
		</g>
	);
}
