import type { MyOrder } from "@/hooks/useOrders";
import OrderRow from "./OrderRow";

/** The trader's orders in this market; stored only in this browser. */
export default function OrderList({ orders }: { orders: MyOrder[] }) {
	if (orders.length === 0) return null;
	return (
		<section aria-label="Your orders" className="olist">
			<h3 className="olist__title">Your orders · only in this browser</h3>
			<ul>
				{orders.map((o) => (
					<OrderRow key={o.orderId} order={o} />
				))}
			</ul>
		</section>
	);
}
