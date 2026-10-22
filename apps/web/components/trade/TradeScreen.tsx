"use client";
import { useSearchParams } from "next/navigation";
import MarketHeader from "@/components/markets/MarketHeader";
import RelayersDown from "@/components/markets/RelayersDown";
import DepositInfo from "@/components/order-ticket/DepositInfo";
import OrderList from "@/components/order-ticket/OrderList";
import OrderTicket from "@/components/order-ticket/OrderTicket";
import RelayerView from "@/components/relayer-view/RelayerView";
import Pane from "@/components/ui/Pane";
import { useMarkets } from "@/hooks/useMarkets";
import { useOrders } from "@/hooks/useOrders";
import { useRelayerView } from "@/hooks/useRelayerView";
import ShareXor from "./ShareXor";

/** The split screen: the trader on the left, the three relayers on the right. */
export default function TradeScreen() {
	const wanted = Number(useSearchParams().get("m"));
	const { markets, down } = useMarkets();
	const { orders } = useOrders();
	const { views, seen, online } = useRelayerView();

	const market = markets?.find((m) => m.id === wanted) ?? markets?.find((m) => m.status === "open");
	const mine = orders.filter((o) => o.market === market?.id);
	const latest = mine[0];
	const ids = new Set(orders.map((o) => o.orderId));

	return (
		<main className="panel split split--trade">
			<Pane className="trader">
				{down && <RelayersDown />}
				{market && (
					<>
						<MarketHeader market={market} />
						<OrderTicket market={market.id} />
						{latest && <ShareXor order={latest} seen={seen[latest.orderId]} />}
						<OrderList orders={mine} />
						<DepositInfo />
					</>
				)}
			</Pane>
			<Pane className="relayers" id="relayers" variant="media">
				<RelayerView
					focus={latest && { orderId: latest.orderId, seen: seen[latest.orderId] }}
					mine={ids}
					online={online}
					views={views}
				/>
			</Pane>
		</main>
	);
}
