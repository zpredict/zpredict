"use client";
import type { Market, Side } from "@zpredict/sdk";
import JudgeButton from "@/components/judge/JudgeButton";
import Amount from "@/components/ui/Amount";
import Card from "@/components/ui/Card";
import Cta from "@/components/ui/Cta";
import { useOrderTicket } from "@/hooks/useOrderTicket";
import { sideName } from "@/lib/format";
import CounterpartyToggle from "./CounterpartyToggle";
import NumberField from "./NumberField";
import SideToggle from "./SideToggle";

interface Props {
	market: Market;
	initialSide?: Side;
}

/** Quick-add amounts, in ZEC. */
const QUICK = [0.01, 0.05, 0.1];

/** Adds without float dust (0.05 + 0.01 = 0.060000000000000005). */
const add = (a: number, b: number) => Math.round(((Number.isNaN(a) ? 0 : a) + b) * 1e8) / 1e8;

export default function OrderTicket({ market, initialSide }: Props) {
	const t = useOrderTicket(market, initialSide);
	const name = sideName(t.side);
	return (
		<Card className="ticket">
			<SideToggle onChange={t.setSide} side={t.side} />
			<NumberField
				id="amount"
				label="Amount"
				min={0}
				onChange={t.setAmount}
				step={0.01}
				unit="ZEC"
				value={t.amount}
			/>
			<fieldset className="ticket__quick">
				<legend className="sr-only">Add to the amount</legend>
				{QUICK.map((n) => (
					<button
						aria-label={`Add ${n} ZEC`}
						className="ticket__add"
						key={n}
						onClick={() => t.setAmount(add(t.amount, n))}
						type="button"
					>
						+{n}
					</button>
				))}
				<button
					aria-label="Stake the whole balance"
					className="ticket__add"
					disabled={!t.max}
					onClick={() => t.setAmount(t.max)}
					type="button"
				>
					Max
				</button>
			</fieldset>
			<details className="ticket__limit">
				<summary>
					Set limit price <span className="num">{t.price}¢</span>
				</summary>
				<NumberField
					id="price"
					label="Limit price"
					max={99}
					min={1}
					onChange={t.setPrice}
					unit="¢"
					value={t.price}
				/>
				<p className="ticket__hint">
					The most you pay per share. Last {name} price:{" "}
					{t.last === null ? "no trades yet" : `${t.last}¢`}. Fills are at the batch midpoint, never
					above your limit.
				</p>
			</details>
			{t.canCounter && (
				<CounterpartyToggle
					on={t.counterparty}
					onChange={t.setCounter}
					otherSide={t.side === 0 ? "NO" : "YES"}
					sideName={name}
				/>
			)}
			<dl className="ticket__sum">
				<dt>Shares</dt>
				<dd className="num">{t.shares}</dd>
				<dt>Avg price</dt>
				<dd className="num">≤ {t.price}¢</dd>
				<dt>Cost</dt>
				<dd>
					<Amount halfTicks={t.cost} />
				</dd>
				{t.counterparty && (
					<>
						<dt>Worst-case cost (pair)</dt>
						<dd>
							<Amount halfTicks={t.worst} />
						</dd>
					</>
				)}
				<dt className="ticket__win">To win</dt>
				<dd className="ticket__win">
					<Amount halfTicks={t.payout} />
				</dd>
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
			<p aria-live="polite" className={t.error ? "ticket__err" : "ticket__hint"}>
				{t.error ||
					"Your browser splits the order into three random shares and sends one to each relayer. Orders cross only inside the 5-second batch they land in, so a fill needs someone on the other side in the same batch; both pay the midpoint."}
			</p>
		</Card>
	);
}
