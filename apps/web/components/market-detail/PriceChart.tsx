"use client";
import { type KeyboardEvent, type PointerEvent, useEffect, useId, useRef, useState } from "react";
import {
	inRange,
	pointLabel,
	RANGES,
	type Range,
	type Series,
	valueAt,
	xTicks,
	yTicks,
} from "@/lib/chart";
import ChartHover from "./ChartHover";

interface Props {
	series: Series[];
	/** Points carry unix seconds (else cross indices, and only "ALL" applies). */
	useTime: boolean;
}

const PAD = { top: 30, right: 48, bottom: 26, left: 0 };

/** Step path through the points, held flat to `end`. */
function stepPath(pts: { x: number; y: number }[], endX: number) {
	if (pts.length === 0) return "";
	const d = pts.map((q, i) =>
		i ? `H${q.x.toFixed(1)}V${q.y.toFixed(1)}` : `M${q.x.toFixed(1)} ${q.y.toFixed(1)}`,
	);
	return `${d.join("")}H${endX.toFixed(1)}`;
}

/**
 * Public clearing prices over time, Polymarket-style: dotted % grid on the right, time axis,
 * range selector, and a crosshair (pointer, touch drag, or arrow keys) that greys out the
 * future and labels each series' price at that moment. Static; no animation.
 */
export default function PriceChart({ series, useTime }: Props) {
	const box = useRef<HTMLDivElement>(null);
	const clip = useId();
	const [[w, H], setSize] = useState([0, 300]);
	const [range, setRange] = useState<Range>("ALL");
	const [at, setAt] = useState<number | null>(null);

	useEffect(() => {
		const el = box.current;
		if (!el) return;
		const measure = () => setSize([el.clientWidth, el.clientHeight]);
		const ro = new ResizeObserver(measure);
		ro.observe(el);
		measure();
		return () => ro.disconnect();
	}, []);

	const all = series.flatMap((s) => s.points);
	const latest = all.length ? Math.max(...all.map((x) => x.t)) : 0;
	const end = useTime ? Math.max(latest, Date.now() / 1000) : latest;
	const span = RANGES.find(([r]) => r === range)?.[1] ?? Number.POSITIVE_INFINITY;
	const shown = series.map((s) => ({
		...s,
		points: inRange(s.points, useTime ? span : Number.POSITIVE_INFINITY, end),
	}));
	const pts = shown.flatMap((s) => s.points);
	const t0 = pts.length ? Math.min(...pts.map((x) => x.t)) : 0;
	const t1 = Math.max(end, t0 + 1);
	const { lo, hi, ticks } = yTicks(pts.map((x) => x.p));
	const times = [...new Set(pts.map((x) => x.t))].sort((a, b) => a - b);

	const iw = Math.max(1, w - PAD.left - PAD.right);
	const ih = H - PAD.top - PAD.bottom;
	const x = (t: number) => PAD.left + ((t - t0) / (t1 - t0)) * iw;
	const y = (p: number) => PAD.top + ((hi - p) / (hi - lo || 1)) * ih;
	const cx = at === null ? null : x(at);

	const snap = (clientX: number) => {
		const r = box.current?.getBoundingClientRect();
		if (!r || times.length === 0) return;
		const t = t0 + ((clientX - r.left - PAD.left) / iw) * (t1 - t0);
		setAt(times.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a)));
	};
	const onPointer = (e: PointerEvent) => snap(e.clientX);
	const onKey = (e: KeyboardEvent) => {
		const i = at === null ? times.length - 1 : times.indexOf(at);
		const next = { ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: times.length - 1 }[e.key];
		if (e.key === "Escape") setAt(null);
		if (next === undefined) return;
		e.preventDefault();
		setAt(times[Math.max(0, Math.min(times.length - 1, next))] ?? null);
	};

	const hoverText =
		at === null
			? "Latest prices"
			: `${pointLabel(at, useTime, times.length)}: ${shown
					.map((s) => `${s.label} ${Math.round(valueAt(s.points, at) ?? 0)}%`)
					.join(", ")}`;

	return (
		<section aria-label="Price history" className="pchart">
			{series.length > 1 && (
				<ul className="pchart__legend">
					{series.map((s) => (
						<li className={`tone-${s.tone}`} key={s.key}>
							{s.label} <span className="num">{Math.round(s.points.at(-1)?.p ?? 0)}%</span>
						</li>
					))}
				</ul>
			)}
			<div
				aria-label="Price chart. Arrow keys move the crosshair, Escape clears it."
				aria-valuemax={times.length}
				aria-valuemin={1}
				aria-valuenow={at === null ? times.length : times.indexOf(at) + 1}
				aria-valuetext={hoverText}
				className="pchart__plot"
				onBlur={() => setAt(null)}
				onKeyDown={onKey}
				onPointerDown={onPointer}
				onPointerLeave={(e) => e.pointerType === "mouse" && setAt(null)}
				onPointerMove={onPointer}
				ref={box}
				role="slider"
				tabIndex={0}
			>
				{pts.length === 0 ? (
					<p className="pchart__empty">No trades yet: the price appears after the first cross.</p>
				) : (
					w > 0 && (
						<svg aria-hidden="true" height={H} width={w}>
							<defs>
								<clipPath id={clip}>
									<rect height={H} width={cx ?? w} x={0} y={0} />
								</clipPath>
							</defs>
							{ticks.map((v) => (
								<g key={v}>
									<line
										className="pchart__grid"
										x1={PAD.left}
										x2={PAD.left + iw}
										y1={y(v)}
										y2={y(v)}
									/>
									<text className="pchart__ylab" x={w - 4} y={y(v) + 4}>
										{v}%
									</text>
								</g>
							))}
							{useTime &&
								xTicks(t0, t1).map((k) => (
									<text className="pchart__xlab" key={k.t} x={x(k.t)} y={H - 6}>
										{k.label}
									</text>
								))}
							{shown.map((s) => {
								const d = stepPath(
									s.points.map((q) => ({ x: x(q.t), y: y(q.p) })),
									x(t1),
								);
								return (
									<g key={s.key}>
										<path className="pchart__line is-dim" d={d} />
										<path
											className={`pchart__line tone-${s.tone}`}
											clipPath={`url(#${clip})`}
											d={d}
										/>
									</g>
								);
							})}
							{at !== null && cx !== null && (
								<ChartHover
									at={at}
									bottom={H - PAD.bottom}
									count={times.length}
									cx={cx}
									series={shown}
									top={PAD.top}
									useTime={useTime}
									w={w}
									y={y}
								/>
							)}
						</svg>
					)
				)}
			</div>
			<fieldset className="pchart__ranges">
				<legend className="sr-only">Range</legend>
				{(useTime ? RANGES : RANGES.slice(-1)).map(([r]) => (
					<button aria-pressed={range === r} key={r} onClick={() => setRange(r)} type="button">
						{r}
					</button>
				))}
				{!useTime && <span className="pchart__note">one point per cross</span>}
			</fieldset>
		</section>
	);
}
