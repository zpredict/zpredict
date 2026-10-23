"use client";
import { useSearchParams } from "next/navigation";
import RelayersDown from "@/components/markets/RelayersDown";
import OrderTicket from "@/components/order-ticket/OrderTicket";
import ShareXor from "@/components/trade/ShareXor";
import { useMarkets } from "@/hooks/useMarkets";
import { useOrders } from "@/hooks/useOrders";
import { seriesOf, timed } from "@/lib/chart";
import { eventOf, outcomeLabel } from "@/lib/markets";
import DetailFaq from "./DetailFaq";
import DetailHeader from "./DetailHeader";
import DetailTabs from "./DetailTabs";
import OutcomeRows from "./OutcomeRows";
import PriceChart from "./PriceChart";
import RelatedMarkets from "./RelatedMarkets";
import Rules from "./Rules";

/**
 * Market detail, Polymarket's layout in zPredict's style: header, price chart, outcome rows,
 * rules, tabs (Relayer View, your positions, price history) and FAQ on the left; the order
 * ticket, your latest order's shares and related markets in a sticky column on the right.
 */
export default function DetailScreen() {
	const params = useSearchParams();
	const wanted = Number(params.get("m"));
	const side = params.get("side") === "no" ? 1 : 0;
	const { markets, down } = useMarkets();
	const { orders } = useOrders();

	if (!markets)
		return down ? <RelayersDown /> : <p className="note detail__loading">Loading market…</p>;
	const market = markets.find((m) => m.id === wanted) ?? markets.find((m) => m.status === "open");
	if (!market) return <p className="note">No such market.</p>;

	const group = eventOf(market, markets);
	const useTime = group.every(timed);
	const series = seriesOf(group, (m) => outcomeLabel(m, group), useTime);
	const mine = orders.filter((o) => o.market === market.id);
	// The trader's own latest order; a demo counter-order is shown under it, never as the result.
	const latest = mine.find((o) => !o.counterOf);
	const counter = latest?.counterId ? mine.find((o) => o.orderId === latest.counterId) : undefined;

	return (
		<>
			{down && <RelayersDown />}
			<DetailHeader group={group} market={market} />
			<div className="detail__chart">
				<PriceChart key={group.map((m) => m.id).join()} series={series} useTime={useTime} />
			</div>
			<OutcomeRows group={group} selected={market} />
			<aside aria-label="Trade" className="detail__side">
				<p className="ticket__market">
					Trading <strong>{market.question}</strong>
				</p>
				{market.status === "open" ? (
					<OrderTicket initialSide={side} key={`${market.id}-${side}`} market={market} />
				) : (
					<p className="note">Trading on this market has closed.</p>
				)}
				{latest && <ShareXor counter={counter} order={latest} />}
				<RelatedMarkets market={market} markets={markets} />
			</aside>
			<Rules market={market} />
			<DetailTabs latest={latest} market={market} mine={mine} orders={orders} />
			<DetailFaq market={market} />
		</>
	);
}
