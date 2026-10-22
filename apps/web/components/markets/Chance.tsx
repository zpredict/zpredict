import type { Market } from "@zpredict/sdk";
import { chance } from "@/lib/markets";

/** The big "71% chance" readout from the public last price. */
export default function Chance({ market }: { market: Market }) {
	const pct = chance(market);
	return (
		<p className="chance">
			<span className="chance__pct num">{pct === null ? "—" : `${pct}%`}</span> chance
		</p>
	);
}
