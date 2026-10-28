"use client";
import { type PointerEvent, useEffect, useRef, useState } from "react";
import { usePrice } from "@/hooks/usePrice";
import { usd, zec } from "@/lib/format";
import type { PnlPoint } from "@/lib/portfolio";

const RANGES = [
	["1D", 86_400],
	["1W", 604_800],
	["1M", 2_592_000],
	["ALL", Number.POSITIVE_INFINITY],
] as const;
type Range = (typeof RANGES)[number][0];
const H = 180;
const PAD = 8;
const FULL = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
	hour: "numeric",
	minute: "2-digit",
});
const signed = (v: number) => `${v >= 0 ? "+" : "−"}${zec(Math.abs(v))} ZEC`;

/** The points inside the range, led by the last earlier one so the curve starts at the edge. */
function inWindow(points: PnlPoint[], range: Range): PnlPoint[] {
	const end = points.at(-1)?.t ?? 0;
	const span = RANGES.find(([r]) => r === range)?.[1] ?? Number.POSITIVE_INFINITY;
	const inside = points.filter((p) => p.t >= end - span);
	const before = points.filter((p) => p.t < end - span).at(-1);
	return before ? [{ t: end - span, v: before.v }, ...inside] : inside;
}

/** The step area and line, a dotted zero line and the crosshair. */
function Plot({ pts, w, hover }: { pts: PnlPoint[]; w: number; hover: PnlPoint | null }) {
	const t0 = pts[0].t;
	const t1 = Math.max(pts[pts.length - 1].t, t0 + 1);
	const vs = pts.map((p) => p.v);
	const lo = Math.min(0, ...vs);
	const hi = Math.max(0, ...vs);
	const x = (t: number) => (PAD + ((t - t0) / (t1 - t0)) * Math.max(0, w - 2 * PAD)).toFixed(1);
	const y = (v: number) => (PAD + ((hi - v) / (hi - lo || 1)) * (H - 2 * PAD)).toFixed(1);
	const line = pts.map((p, i) => (i ? `H${x(p.t)}V${y(p.v)}` : `M${x(p.t)} ${y(p.v)}`)).join("");
	const zero = y(0);
	// Lime above zero, red below: the same line drawn twice, each clipped to its side.
	return (
		<svg aria-hidden="true" height={H} width={w}>
			<defs>
				<clipPath id="pnl-up">
					<rect height={zero} width={w} x="0" y="0" />
				</clipPath>
				<clipPath id="pnl-down">
					<rect height={H} width={w} x="0" y={zero} />
				</clipPath>
			</defs>
			<line className="pnl__zero" x1={PAD} x2={w - PAD} y1={zero} y2={zero} />
			<g clipPath="url(#pnl-up)">
				<path d={`${line}V${zero}H${x(t0)}Z`} fill="var(--zp-lime)" fillOpacity="0.14" />
				<path d={line} fill="none" stroke="var(--zp-lime)" strokeWidth="2" />
			</g>
			<g clipPath="url(#pnl-down)">
				<path d={`${line}V${zero}H${x(t0)}Z`} fill="#ff6b6b" fillOpacity="0.14" />
				<path d={line} fill="none" stroke="#ff6b6b" strokeWidth="2" />
			</g>
			{hover && (
				<line className="pnl__cross" x1={x(hover.t)} x2={x(hover.t)} y1={PAD} y2={H - PAD} />
			)}
		</svg>
	);
}

/**
 * P&L over time as a step area, lime above zero and red below, with a range selector and a
 * crosshair. The points come from this browser's own fills (`pnlSeries`); nothing is fetched.
 */
export default function PnlChart({ points }: { points: PnlPoint[] }) {
	const box = useRef<HTMLDivElement>(null);
	const [w, setW] = useState(0);
	const [range, setRange] = useState<Range>("ALL");
	const [hover, setHover] = useState<PnlPoint | null>(null);
	const price = usePrice();
	useEffect(() => {
		const el = box.current;
		if (!el) return;
		const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	const pts = inWindow(points, range);
	const shown = hover ?? points.at(-1) ?? { t: 0, v: 0 };
	const onMove = (e: PointerEvent<HTMLDivElement>) => {
		if (pts.length < 2) return;
		const r = e.currentTarget.getBoundingClientRect();
		const [t0, t1] = [pts[0].t, pts[pts.length - 1].t];
		const t = t0 + ((e.clientX - r.left - PAD) / Math.max(1, r.width - 2 * PAD)) * (t1 - t0);
		// Free crosshair: the time under the pointer, with the step value in force then.
		const at = Math.min(t1, Math.max(t0, t));
		setHover({ t: at, v: (pts.filter((p) => p.t <= at).at(-1) ?? pts[0]).v });
	};

	return (
		<section aria-label="Profit and loss over time" className="pnl">
			<div className="pnl__head">
				<div>
					<p className="ptile__k">Profit / loss</p>
					<p className={`pnl__v num ${shown.v >= 0 ? "is-up" : "is-down"}`}>{signed(shown.v)}</p>
					<p className="ptile__sub num">
						{hover ? FULL.format(hover.t * 1000) : "Now"}
						{price && ` · ${usd(shown.v, price.zecUsd)}`}
					</p>
				</div>
				<fieldset className="pchart__ranges">
					<legend className="sr-only">Range</legend>
					{RANGES.map(([r]) => (
						<button aria-pressed={range === r} key={r} onClick={() => setRange(r)} type="button">
							{r}
						</button>
					))}
				</fieldset>
			</div>
			<div
				className="pnl__plot"
				onPointerLeave={() => setHover(null)}
				onPointerMove={onMove}
				ref={box}
			>
				{pts.length < 2 ? (
					<p className="pempty">No price moves yet. The curve fills in as markets trade.</p>
				) : (
					<Plot hover={hover} pts={pts} w={w} />
				)}
			</div>
		</section>
	);
}
