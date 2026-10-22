const CELLS = 24;

/** The YES chance as a row of ASCII cells: lime `#` for YES, grey `.` for the rest. */
export default function ProbabilityBar({ yes }: { yes: number | null }) {
	const n = Math.round(((yes ?? 0) / 100) * CELLS);
	return (
		<p aria-hidden="true" className="pbar">
			{Array.from({ length: CELLS }, (_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: fixed cells, position is the identity
				<span className={i < n ? "is-yes" : undefined} key={i}>
					{i < n ? "#" : "."}
				</span>
			))}
		</p>
	);
}
