import type { Market } from "@zpredict/sdk";
import { approx, CONFIRMATIONS, heightLabel, isMirrored, secsUntil } from "@/lib/markets";

/** Where the market is in its life, in blocks and nominal minutes from the tip. */
export default function Countdown({ market: m, tip }: { market: Market; tip: number | null }) {
	if (tip === null || m.status === "resolved") return null;
	const left = (h: number) =>
		`${heightLabel(Math.max(0, h - tip))} blocks · ${approx(secsUntil(tip, h))}`;
	const text =
		m.status === "open"
			? `Trading closes in ${left(m.closeHeight)}`
			: isMirrored(m)
				? "Closed · waiting for Polymarket to settle"
				: tip < m.resolveHeight
					? `Closed · block ${heightLabel(m.resolveHeight)} in ${left(m.resolveHeight)}`
					: `Resolving · ${left(m.resolveHeight + CONFIRMATIONS)} of confirmations left`;
	return <p className="countdown num">{text}</p>;
}
