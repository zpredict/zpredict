import ScrambleHeading from "@/components/ui/ScrambleHeading";

interface Props {
	title: string;
	items: readonly string[];
}

/** A titled list with square lime markers, like the template's process steps. */
export default function BulletCard({ title, items }: Props) {
	return (
		<div className="bullets">
			<ScrambleHeading className="bullets__title" lines={[title]} />
			<ol>
				{items.map((it) => (
					<li key={it}>{it}</li>
				))}
			</ol>
		</div>
	);
}
