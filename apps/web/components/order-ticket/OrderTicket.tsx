"use client";
import type { Market, Side } from "@zpredict/sdk";
import JudgeButton from "@/components/judge/JudgeButton";
import Card from "@/components/ui/Card";
import Cta from "@/components/ui/Cta";
import { useOrderTicket } from "@/hooks/useOrderTicket";
import NumberField from "./NumberField";
import SideToggle from "./SideToggle";

interface Props {
	market: Market;
	initialSide?: Side;
}

export default function OrderTicket({ market, initialSide }: Props) {
	const t = useOrderTicket(market, initialSide);
	return (
		<Card className="ticket">
			<SideToggle onChange={t.setSide} side={t.side} />
			<div className="ticket__fields">
				<NumberField
					id="price"
					label="Limit price"
					max={99}
					min={1}
					onChange={t.setPrice}
					unit="¢"
					value={t.price}
				/>
				<NumberField
					id="size"
					label="Size"
					max={1_000_000}
					min={1}
					onChange={t.setSize}
					unit="contracts"
					value={t.size}
				/>
			</div>
			<dl className="ticket__sum">
				<dt>Last {t.side === 0 ? "YES" : "NO"} price</dt>
				<dd className="num">{t.last === null ? "no trades yet" : `${t.last}¢`}</dd>
				<dt>Worst-case cost</dt>
				<dd className="num">{t.cost} units</dd>
				<dt>Pays if {t.side === 0 ? "YES" : "NO"}</dt>
				<dd className="num">{t.payout} units</dd>
			</dl>
			{t.hasAccount ? (
				<Cta disabled={!t.canSubmit} onClick={t.submit}>
					{t.busy ? "Sending shares…" : "Split & send"}
				</Cta>
			) : (
				<div className="ticket__judge">
					<JudgeButton />
					<span className="dim">to get a demo account first</span>
				</div>
			)}
			<p className={t.error ? "ticket__err" : "ticket__hint"}>
				{t.error ||
					"Your browser splits the order into three random shares and sends one to each relayer. The limit starts a few cents above the last price so it crosses; you pay the midpoint."}
			</p>
		</Card>
	);
}
