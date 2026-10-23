const R = 20;
const C = 2 * Math.PI * R;

/** The YES chance as a square-capped ring with the % inside, from the public last price. */
export default function ChanceRing({ pct }: { pct: number | null }) {
	const v = pct ?? 0;
	return (
		<div className="ring">
			<svg aria-hidden="true" className="ring__svg" viewBox="0 0 48 48">
				<circle className="ring__track" cx="24" cy="24" r={R} />
				<circle
					className="ring__val"
					cx="24"
					cy="24"
					r={R}
					strokeDasharray={`${(v / 100) * C} ${C}`}
					transform="rotate(-90 24 24)"
				/>
			</svg>
			<p className="ring__text">
				<span className="ring__pct num">{pct === null ? "—" : `${pct}%`}</span>
				<span className="ring__label">chance</span>
			</p>
		</div>
	);
}
