import type { Market } from "@zpredict/sdk";
import { topic } from "@/lib/markets";

/** Square ASCII badge standing in for a market image: the first letter of its topic. */
export default function Glyph({ market, size = "sm" }: { market: Market; size?: "sm" | "lg" }) {
	return (
		<span aria-hidden="true" className={`glyph glyph--${size}`}>
			{market.rolling ? "↻" : topic(market).charAt(0)}
		</span>
	);
}
