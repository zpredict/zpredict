"use client";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import type { MyOrder } from "@/hooks/useOrders";
import type { Seen } from "@/hooks/useRelayerView";
import { avgCents, sideName } from "@/lib/format";
import { openFill, openOrder, xorHex } from "@/lib/shares";
import HexBytes from "./HexBytes";

interface Props {
	order: MyOrder;
	seen?: Seen;
}

/**
 * The trader's side of the split screen: the three shares exactly as the relayers hold
 * them, and the order that only appears when all three are XORed together.
 */
export default function ShareXor({ order, seen }: Props) {
	const shares = seen?.order ?? [];
	const plain = xorHex(shares);
	const opened = openOrder(shares);
	const fill = openFill(seen?.fill ?? []);
	return (
		<Card className="xor">
			<header className="xor__head">
				<span>Your order, as the relayers hold it</span>
				<Badge tone="you">{order.orderId.slice(0, 8)}</Badge>
			</header>
			{[0, 1, 2].map((i) => (
				<div className={`xor__row${shares[i] ? " is-in" : ""}`} key={i}>
					<span className="xor__who">R{i}</span>
					<HexBytes hex={shares[i] ?? null} />
				</div>
			))}
			<div className="xor__row xor__row--plain">
				<span className="xor__who">⊕</span>
				<HexBytes fields hex={plain} />
			</div>
			<p className="xor__decoded">
				{opened
					? `market ${opened.market} · ${sideName(opened.side)} · ${opened.price}¢ · ${opened.size} contracts`
					: "Waiting for the shares to land at all three relayers…"}
			</p>
			<p className={`xor__fill${fill?.filled ? " is-filled" : ""}`} role="status">
				{fill?.filled
					? `Filled ${fill.size} @ ${avgCents(fill).toFixed(1)}¢ average — only you can open this.`
					: fill
						? "Batch cleared: not filled. Unfilled orders are never opened."
						: `Waiting for batch ${order.batch} to clear…`}
			</p>
		</Card>
	);
}
