"use client";
import { useSaved } from "@/hooks/useSaved";

/** Bookmark toggle for a card; the list lives in this browser only. */
export default function SaveButton({ itemKey, title }: { itemKey: string; title: string }) {
	const { saved, toggle } = useSaved();
	const on = saved.includes(itemKey);
	return (
		<button
			aria-label={on ? `Remove from saved: ${title}` : `Save: ${title}`}
			aria-pressed={on}
			className="save"
			onClick={() => toggle(itemKey)}
			title={on ? "Saved" : "Save"}
			type="button"
		>
			<svg aria-hidden="true" height="14" viewBox="0 0 24 24" width="14">
				<path
					d="M6 3h12v18l-6-4.5L6 21z"
					fill={on ? "currentColor" : "none"}
					stroke="currentColor"
					strokeWidth="2"
				/>
			</svg>
		</button>
	);
}
