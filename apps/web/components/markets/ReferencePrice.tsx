import type { Market } from "@zpredict/sdk";
import { referenceUrl } from "@/lib/markets";

/**
 * Compact form of `Reference`: a mirrored market's Polymarket price, as fetched by the relayers
 * (the browser never calls Polymarket). Linked only to an https page on polymarket.com, as plain
 * navigation with no referrer.
 */
export default function ReferencePrice({ market: m }: { market: Market }) {
	if (!m.reference) return null;
	const text = (
		<>
			Polymarket reference <span className="num">{Math.round(m.reference.price)}¢</span>
		</>
	);
	const url = referenceUrl(m);
	return url ? (
		<a
			className="refprice"
			href={url}
			rel="noopener noreferrer"
			target="_blank"
			title="Market data from Polymarket; not affiliated"
		>
			{text} ↗
		</a>
	) : (
		<span className="refprice">{text}</span>
	);
}
