"use client";
import { accountHex, type Market } from "@zpredict/sdk";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import GeneratedAvatar from "@/components/account/GeneratedAvatar";
import Glyph from "@/components/markets/Glyph";
import WithdrawForm from "@/components/order-ticket/WithdrawForm";
import CopyButton from "@/components/ui/CopyButton";
import Cta from "@/components/ui/Cta";
import { useAccount } from "@/hooks/useAccount";
import { type MyOrder, useOrders } from "@/hooks/useOrders";
import { usePortfolio } from "@/hooks/usePortfolio";
import { usePrice } from "@/hooks/usePrice";
import { sideName, usd, zec } from "@/lib/format";
import type { Position } from "@/lib/portfolio";

const signed = (v: number) => `${v >= 0 ? "+" : "−"}${zec(Math.abs(v))}`;
const tone = (v: number) => (v > 0 ? "is-up" : v < 0 ? "is-down" : "");

/** A summary tile: the figure in ZEC, and a quieter line under it. */
function Tile({
	label,
	value,
	sub,
	cls = "",
}: {
	label: string;
	value: string;
	sub?: string;
	cls?: string;
}) {
	return (
		<div className="ptile">
			<p className="ptile__k">{label}</p>
			<p className={`ptile__v num ${cls}`}>{value}</p>
			{sub && <p className="ptile__sub num">{sub}</p>}
		</div>
	);
}

function Outcome({ side }: { side: 0 | 1 }) {
	return <span className={`opill opill--${side === 0 ? "yes" : "no"}`}>{sideName(side)}</span>;
}

function MarketCell({ m, id, hedged }: { m?: Market; id: number; hedged?: boolean }) {
	return (
		<td className="pmarket">
			{m && <Glyph market={m} />}
			<span>
				<Link href={`/trade/?m=${id}`}>{m?.question ?? `Market ${id}`}</Link>
				{hedged && <span className="ptag">Self-trade</span>}
			</span>
		</td>
	);
}

/** One holding: average → last price, value now and P&L against what it cost. */
function Row({ p, m }: { p: Position; m?: Market }) {
	const last = m?.lastPrice;
	const now = last === undefined ? null : Math.round(p.side === 0 ? last : 100 - last);
	const pnl = p.value === null ? null : p.value - p.cost;
	return (
		<tr className={p.hedged ? "is-hedge" : undefined}>
			<MarketCell hedged={p.hedged} id={p.market} m={m} />
			<td>
				<Outcome side={p.side} />
			</td>
			<td className="num">{p.shares}</td>
			<td className="num">
				{(p.cost / p.shares / 2).toFixed(1)}¢ → {now === null ? "—" : `${now}¢`}
			</td>
			<td className="num">{p.value === null ? "—" : zec(p.value)}</td>
			<td className={`num ${pnl === null ? "" : tone(pnl)}`}>{pnl === null ? "—" : signed(pnl)}</td>
		</tr>
	);
}

function OrderRow({ o, m }: { o: MyOrder; m?: Market }) {
	const filled = o.fill?.filled;
	return (
		<tr className={o.counterOf ? "is-hedge" : undefined}>
			<MarketCell hedged={Boolean(o.counterOf)} id={o.market} m={m} />
			<td>
				<Outcome side={o.side} />
			</td>
			<td className="num">
				{o.size} @ ≤ {o.price}¢
			</td>
			<td className="num dim">{new Date(o.at).toLocaleString()}</td>
			<td className={`num ${filled ? "is-up" : ""}`}>
				{filled ? `${o.fill?.size} filled` : o.status}
			</td>
		</tr>
	);
}

/** Positions, open orders and history, as tabs with counts. */
function Activity({
	held,
	open,
	history,
	byId,
}: {
	held: Position[];
	open: MyOrder[];
	history: MyOrder[];
	byId: (id: number) => Market | undefined;
}) {
	const [tab, setTab] = useState(0);
	const tabs = [
		["Positions", held.length],
		["Open", open.length],
		["History", history.length],
	] as const;
	return (
		<>
			<div aria-label="Your activity" className="ptabs" role="tablist">
				{tabs.map(([t, n], i) => (
					<button
						aria-selected={tab === i}
						className="ptabs__tab"
						key={t}
						onClick={() => setTab(i)}
						role="tab"
						type="button"
					>
						{t} <span className="ptabs__n">{n}</span>
					</button>
				))}
			</div>

			{tab === 0 &&
				(held.length === 0 ? (
					<p className="pempty">
						No positions yet. <Link href="/">Pick a market →</Link>
					</p>
				) : (
					<table className="ptable">
						<thead>
							<tr>
								<th>Market</th>
								<th>Side</th>
								<th className="num">Shares</th>
								<th className="num">Avg → now</th>
								<th className="num">Value</th>
								<th className="num">P&amp;L</th>
							</tr>
						</thead>
						<tbody>
							{held.map((p) => (
								<Row key={`${p.market}:${p.side}:${p.hedged}`} m={byId(p.market)} p={p} />
							))}
						</tbody>
					</table>
				))}
			{tab !== 0 &&
				((tab === 1 ? open : history).length === 0 ? (
					<p className="pempty">{tab === 1 ? "No open orders." : "No orders yet."}</p>
				) : (
					<table className="ptable">
						<thead>
							<tr>
								<th>Market</th>
								<th>Side</th>
								<th className="num">Order</th>
								<th className="num">Placed</th>
								<th className="num">Status</th>
							</tr>
						</thead>
						<tbody>
							{(tab === 1 ? open : history).map((o) => (
								<OrderRow key={o.orderId} m={byId(o.market)} o={o} />
							))}
						</tbody>
					</table>
				))}
		</>
	);
}

/**
 * The account page: who you are (the public account id, never the tag), the portfolio in four
 * tiles, Deposit and Withdraw, then positions, open orders and history. Everything is computed
 * in this browser from its own fills; the relayers never learn holdings.
 */
export default function PortfolioScreen() {
	const { tag } = useAccount();
	const { orders } = useOrders();
	const { cash, held, invested, total, markets } = usePortfolio();
	const price = usePrice();
	const router = useRouter();
	const [withdraw, setWithdraw] = useState(false);
	const byId = (id: number) => markets.find((m) => m.id === id);
	const dollars = (v: bigint | number | null) =>
		v === null || !price ? undefined : usd(v, price.zecUsd);

	if (!tag)
		return (
			<section className="portfolio portfolio--empty">
				<h1 className="portfolio__title">Your account</h1>
				<p className="dim">No account in this browser yet. One click gets you real testnet ZEC.</p>
				<Cta onClick={() => router.push("/faucet/")}>Get testnet ZEC</Cta>
			</section>
		);

	const id = accountHex(tag);
	const mine = held.filter((p) => !p.hedged);
	const cost = mine.reduce((n, p) => n + p.cost, 0);
	const pnl = mine.reduce((n, p) => n + (p.value === null ? 0 : p.value - p.cost), 0);
	const open = orders.filter((o) => o.status === "pending");
	const history = [...orders].sort((a, b) => b.at - a.at);

	return (
		<section aria-labelledby="portfolio-title" className="portfolio">
			<header className="phead">
				<GeneratedAvatar name={id} size={64} />
				<div className="phead__who">
					<h1 className="portfolio__title" id="portfolio-title">
						Your account
					</h1>
					<p className="phead__id">
						<span className="num">
							{id.slice(0, 8)}…{id.slice(-4)}
						</span>
						<CopyButton label="Copy id" text={id} />
						<span className="dim">Zcash testnet · funded by real deposits</span>
					</p>
				</div>
				<div className="phead__actions">
					<Cta onClick={() => router.push("/wallet/")}>Deposit</Cta>
					<button
						aria-expanded={withdraw}
						className="pbtn"
						onClick={() => setWithdraw((w) => !w)}
						type="button"
					>
						Withdraw
					</button>
				</div>
			</header>

			<div className="ptiles">
				<Tile
					label="Portfolio"
					sub={dollars(total)}
					value={total === null ? "…" : `${zec(total)} ZEC`}
				/>
				<Tile
					label="Cash"
					sub={dollars(cash) ?? "available to trade"}
					value={cash === null ? "…" : `${zec(cash)} ZEC`}
				/>
				<Tile
					label="Positions"
					sub={`${mine.length} holding${mine.length === 1 ? "" : "s"}`}
					value={`${zec(invested)} ZEC`}
				/>
				<Tile
					cls={tone(pnl)}
					label="Profit / loss"
					sub={
						cost ? `${((pnl / cost) * 100).toFixed(1)}% on ${zec(cost)} ZEC` : "no positions yet"
					}
					value={`${signed(pnl)} ZEC`}
				/>
			</div>

			{withdraw && (
				<div className="pwithdraw" id="withdraw">
					<WithdrawForm />
				</div>
			)}

			<Activity byId={byId} held={held} history={history} open={open} />

			<p className="pnote dim">
				Only this browser knows your holdings and orders: it combines your fills from three random
				shares, and the relayers never learn them. Self-trade rows are the demo counterparty, the
				opposite side your own account took so each order fills; each pair nets out at resolution.
			</p>
		</section>
	);
}
