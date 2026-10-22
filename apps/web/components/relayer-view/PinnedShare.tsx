import { bytes } from "@/lib/format";

interface Props {
	orderId: string;
	order?: string;
	fill?: string;
}

/** The trader's latest order as this relayer holds it, pinned above the stream. */
export default function PinnedShare({ orderId, order, fill }: Props) {
	return (
		<div className="pinned">
			<p className="pinned__head">
				<span className="vrow__you">you</span>
				<span className="vrow__id">{orderId.slice(0, 8)}</span>
			</p>
			<p className="pinned__line">
				<span className="pinned__k">order</span>
				<span>{order ? bytes(order).join(" ") : "waiting…"}</span>
			</p>
			<p className="pinned__line">
				<span className="pinned__k">fill</span>
				<span>{fill ? bytes(fill).join(" ") : "after the batch"}</span>
			</p>
		</div>
	);
}
