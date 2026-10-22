import Card from "@/components/ui/Card";

interface Props {
	title: string;
	items: readonly string[];
}

/** A titled card with a short list: the leak checklist, the mock list. */
export default function BulletCard({ title, items }: Props) {
	return (
		<Card className="bullets">
			<h2 className="bullets__title">{title}</h2>
			<ul>
				{items.map((it) => (
					<li key={it}>{it}</li>
				))}
			</ul>
		</Card>
	);
}
