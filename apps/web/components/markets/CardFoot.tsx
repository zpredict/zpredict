import type { Market } from "@zpredict/sdk";
import { usdCompact } from "@/lib/format";
import { approx, secsUntil } from "@/lib/markets";
import SaveButton from "./SaveButton";

/** Polymarket's volume over a card's markets; undefined when none has one. */
function volume(markets: Market[]): number | undefined {
	const vs = markets.flatMap((m) =>
		m.reference?.volume === undefined ? [] : [m.reference.volume],
	);
	return vs.length ? vs.reduce((a, b) => a + b, 0) : undefined;
}

/**
 * Card footer: Polymarket's volume for a mirrored market (zPredict's own sizes are never
 * published) or the time left for a chain market, and the save toggle.
 */
export default function CardFoot({
	markets,
	itemKey,
	title,
	tip,
}: {
	markets: Market[];
	itemKey: string;
	title: string;
	tip: number | null;
}) {
	const m = markets[0];
	const vol = volume(markets);
	const left =
		tip !== null && m.status === "open" && tip < m.closeHeight
			? `closes ${approx(secsUntil(tip, m.closeHeight))}`
			: m.status !== "open"
				? m.status
				: null;
	return (
		<footer className="mcard__foot">
			{vol !== undefined ? (
				<span title="Traded on Polymarket. zPredict never publishes its own sizes.">
					<span className="num">{usdCompact(vol)}</span> Polymarket vol.
				</span>
			) : (
				<span>{left}</span>
			)}
			<SaveButton itemKey={itemKey} title={title} />
		</footer>
	);
}
