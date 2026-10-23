import type { Market } from "@zpredict/sdk";

type Reference = NonNullable<Market["reference"]>;

/**
 * Mirrored markets (#114): the source market's public price, as fetched by the relayers (the
 * browser never calls Polymarket). The link is plain navigation, with no referrer.
 */
export default function ReferencePrice({ reference: r }: { reference: Reference }) {
	return (
		<a
			className="refprice"
			href={r.url}
			rel="noopener noreferrer"
			target="_blank"
			title="Market data from Polymarket; not affiliated"
		>
			Polymarket reference <span className="num">{Math.round(r.price)}¢</span> ↗
		</a>
	);
}
