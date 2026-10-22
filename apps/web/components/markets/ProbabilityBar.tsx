/** Thin bar filled to the YES chance. */
export default function ProbabilityBar({ yes }: { yes: number | null }) {
	return (
		<div aria-hidden="true" className="pbar">
			<span style={{ width: `${yes ?? 0}%` }} />
		</div>
	);
}
