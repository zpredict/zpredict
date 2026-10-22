interface Props {
	/** Prices in cents, oldest first. */
	points: number[];
	className?: string;
}

const W = 100;
const H = 32;

/** Clearing-price history: a line plus a faint area, scaled to its own range (as on the landing). */
export default function Sparkline({ points, className = "" }: Props) {
	if (points.length < 2) return <span className={`spark spark--empty ${className}`} />;
	const min = Math.min(...points);
	const span = Math.max(...points) - min || 1;
	const xy = points.map((p, i) => [
		(i / (points.length - 1)) * W,
		H - 2 - ((p - min) / span) * (H - 4),
	]);
	const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
	return (
		<svg
			aria-hidden="true"
			className={`spark ${className}`}
			preserveAspectRatio="none"
			viewBox={`0 0 ${W} ${H}`}
		>
			<path className="spark__area" d={`${line} L${W} ${H} L0 ${H} Z`} />
			<path className="spark__line" d={line} />
		</svg>
	);
}
