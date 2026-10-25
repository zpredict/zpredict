import { bytes, ORDER_FIELDS } from "@/lib/format";

// The account key's bytes in a share. Never on screen: the three panels sit side by side, and
// their key shares XOR back to the key (#159).
const KEY = ORDER_FIELDS.find((f) => f.name === "key");
const masked = (hex: string) =>
	bytes(hex).map((b, i) => (KEY && i >= KEY.from && i < KEY.to ? "··" : b));

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
				<span>{order ? masked(order).join(" ") : orderId ? "waiting…" : "—"}</span>
			</p>
			<p className="pinned__line">
				<span className="pinned__k">fill</span>
				<span>{fill ? bytes(fill).join(" ") : orderId ? "after the batch" : "—"}</span>
			</p>
		</div>
	);
}
