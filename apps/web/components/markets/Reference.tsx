import type { Market } from "@zpredict/sdk";
import { referenceUrl } from "@/lib/markets";

/**
 * A mirrored market's Polymarket price beside ours. The relayers fetch it; this page never
 * contacts Polymarket. The link is a plain anchor: nothing loads until a click, and the
 * click sends no referrer.
 */
export default function Reference({ market: m }: { market: Market }) {
	const ref = m.reference;
	if (!ref) return null;
	const url = referenceUrl(m);
	const price = `${Math.round(ref.price)}¢`;
	return (
		<div className="ref">
			<p className="ref__price num">
				{url ? (
					<a href={url} rel="noopener noreferrer" target="_blank">
						Polymarket reference: {price} ↗
					</a>
				) : (
					<>Polymarket reference: {price}</>
				)}
			</p>
			<p className="ref__note">Market data from Polymarket · not affiliated</p>
		</div>
	);
}
