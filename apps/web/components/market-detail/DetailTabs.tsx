"use client";
import type { Market } from "@zpredict/sdk";
import { type KeyboardEvent, useMemo, useState } from "react";
import DepositInfo from "@/components/order-ticket/DepositInfo";
import OrderList from "@/components/order-ticket/OrderList";
import WithdrawForm from "@/components/order-ticket/WithdrawForm";
import RelayerView from "@/components/relayer-view/RelayerView";
import type { MyOrder } from "@/hooks/useOrders";
import { useRelayerView } from "@/hooks/useRelayerView";
import { digestsOf } from "@/lib/shares";
import PriceTable from "./PriceTable";

const TABS = ["Relayer View", "Your positions", "Price history"] as const;

interface Props {
	market: Market;
	mine: MyOrder[];
	orders: MyOrder[];
	latest?: MyOrder;
}

/**
 * Where Polymarket shows comments, holders and activity, zPredict shows what can be shown:
 * what each relayer receives (noise), your own orders (kept only in this browser) and the
 * public clearing prices. Panels stay mounted, so the Relayer View keeps streaming.
 */
export default function DetailTabs({ market, mine, orders, latest }: Props) {
	const [tab, setTab] = useState(0);
	const { views, online } = useRelayerView();
	const digests = useMemo(() => digestsOf(orders), [orders]);
	const onKey = (e: KeyboardEvent) => {
		const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
		if (!d) return;
		const next = (tab + d + TABS.length) % TABS.length;
		setTab(next);
		document.getElementById(`dtab-${next}`)?.focus();
	};
	return (
		<section aria-label="Market activity" className="dtabs">
			<div aria-label="Market activity" className="dtabs__list" onKeyDown={onKey} role="tablist">
				{TABS.map((t, i) => (
					<button
						aria-controls={`dpanel-${i}`}
						aria-selected={tab === i}
						className="dtabs__tab"
						id={`dtab-${i}`}
						key={t}
						onClick={() => setTab(i)}
						role="tab"
						tabIndex={tab === i ? 0 : -1}
						type="button"
					>
						{t}
					</button>
				))}
			</div>
			<div aria-labelledby="dtab-0" hidden={tab !== 0} id="dpanel-0" role="tabpanel">
				<RelayerView focus={latest} mine={digests} online={online} views={views} />
			</div>
			<div
				aria-labelledby="dtab-1"
				className="dtabs__pos"
				hidden={tab !== 1}
				id="dpanel-1"
				role="tabpanel"
			>
				<p className="dim">
					Only this browser knows your orders and fills. The relayers hold random shares of them.
				</p>
				{mine.length === 0 && <p className="dim">No orders on this market yet.</p>}
				<OrderList orders={mine} />
				<DepositInfo />
				<WithdrawForm />
			</div>
			<div aria-labelledby="dtab-2" hidden={tab !== 2} id="dpanel-2" role="tabpanel">
				<PriceTable market={market} />
			</div>
		</section>
	);
}
