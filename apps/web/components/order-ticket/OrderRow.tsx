import Badge from "@/components/ui/Badge";
import type { MyOrder } from "@/hooks/useOrders";
import { avgCents, sideName } from "@/lib/format";

const fillText = (o: MyOrder) => {
	if (o.status === "pending") return "pending";
	if (!o.fill?.filled) return "unfilled";
	return `${o.fill.size} @ ${avgCents(o.fill).toFixed(1)}¢`;
};

export default function OrderRow({ order: o }: { order: MyOrder }) {
	return (
		<li className={`orow orow--${o.status}${o.counterOf ? " orow--counter" : ""}`}>
			<Badge tone={o.side === 0 ? "yes" : "no"}>{sideName(o.side)}</Badge>
			<span className="num">
				{o.size} × {o.price}¢
			</span>
			<span className="orow__id">
				{o.counterOf ? "demo counterparty (self-trade)" : o.orderId.slice(0, 8)}
			</span>
			<span className="orow__fill num">{fillText(o)}</span>
		</li>
	);
}
