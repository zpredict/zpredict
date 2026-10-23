import type { Market } from "@zpredict/sdk";
import { approx, secsUntil } from "@/lib/markets";
import ReferencePrice from "./ReferencePrice";

/** Card footer: what stays hidden (where Polymarket shows volume), time left, reference price. */
export default function CardFoot({ market: m, tip }: { market: Market; tip: number | null }) {
	const left =
		tip !== null && m.status === "open" && tip < m.closeHeight
			? `closes ${approx(secsUntil(tip, m.closeHeight))}`
			: m.status !== "open"
				? m.status
				: null;
	return (
		<footer className="mcard__foot">
			<span title="Bettors and sizes are never published">Bettors · sizes hidden</span>
			{m.reference ? <ReferencePrice market={m} /> : left && <span>{left}</span>}
		</footer>
	);
}
