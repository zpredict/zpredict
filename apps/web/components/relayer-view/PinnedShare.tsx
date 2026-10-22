import { bytes } from "@/lib/format";

interface Props {
	orderId?: string;
	order?: string;
	fill?: string;
}

/** The trader's latest order as this relayer holds it. Always takes its space, so nothing jumps. */
export default function PinnedShare({ orderId, order, fill }: Props) {
	return (
		<div className={`pinned${orderId ? " is-on" : ""}`}>
			<p className="pinned__head">
				<span className="vrow__you">you</span>
				<span>{orderId ? orderId.slice(0, 8) : "no order yet"}</span>
			</p>
			<p className="pinned__line">
				<span className="pinned__k">order</span>
				<span>{order ? bytes(order).join(" ") : orderId ? "waiting…" : "—"}</span>
			</p>
			<p className="pinned__line">
				<span className="pinned__k">fill</span>
				<span>{fill ? bytes(fill).join(" ") : orderId ? "after the batch" : "—"}</span>
			</p>
		</div>
	);
}
