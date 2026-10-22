"use client";
import { useSearchParams } from "next/navigation";
import MarketHeader from "@/components/markets/MarketHeader";
import RelayersDown from "@/components/markets/RelayersDown";
import DepositInfo from "@/components/order-ticket/DepositInfo";
import OrderList from "@/components/order-ticket/OrderList";
import OrderTicket from "@/components/order-ticket/OrderTicket";
import WithdrawForm from "@/components/order-ticket/WithdrawForm";
import RelayerView from "@/components/relayer-view/RelayerView";
import Pane from "@/components/ui/Pane";
import { useMarkets } from "@/hooks/useMarkets";
import { useOrders } from "@/hooks/useOrders";
import { useRelayerView } from "@/hooks/useRelayerView";
import ShareXor from "./ShareXor";

/** The split screen: the trader on the left, the three relayers on the right. Sits in `main.trade`. */
export default function TradeScreen() {
	const params = useSearchParams();
	const wanted = Number(params.get("m"));
	const side = params.get("side") === "no" ? 1 : 0;
	const { markets, down } = useMarkets();
	const { orders } = useOrders();
	const { views, seen, online } = useRelayerView();

	const market = markets?.find((m) => m.id === wanted) ?? markets?.find((m) => m.status === "open");
	const mine = orders.filter((o) => o.market === market?.id);
	const latest = mine[0];
	const ids = new Set(orders.map((o) => o.orderId));

	return (
		<>
			{/* The split renders once the market is known: on phones the trader pane sits above the
			    relayers, and filling it in later would push the whole Relayer View down (CLS). */}
			{!markets && !down && <p className="note">Loading market…</p>}
			{(markets || down) && (
				<>
					<Pane aria-label="Your order" className="trader">
						{down && <RelayersDown />}
						{market && (
							<>
								<MarketHeader market={market} />
								{market.status === "open" ? (
									<OrderTicket initialSide={side} key={`${market.id}-${side}`} market={market} />
								) : (
									<p className="note">Trading on this market has closed.</p>
								)}
								{latest && <ShareXor order={latest} seen={seen[latest.orderId]} />}
								<OrderList orders={mine} />
								<DepositInfo />
								<WithdrawForm />
							</>
						)}
					</Pane>
					<Pane aria-label="Relayer View" className="relayers" id="relayers">
						<RelayerView
							focus={latest && { orderId: latest.orderId, seen: seen[latest.orderId] }}
							mine={ids}
							online={online}
							views={views}
						/>
					</Pane>
				</>
			)}
		</>
	);
}
