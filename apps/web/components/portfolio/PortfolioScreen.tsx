"use client";
import { accountHex } from "@zpredict/sdk";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { hue } from "@/components/account/AccountMenu";
import WithdrawForm from "@/components/order-ticket/WithdrawForm";
import Amount from "@/components/ui/Amount";
import Badge from "@/components/ui/Badge";
import CopyButton from "@/components/ui/CopyButton";
import Cta from "@/components/ui/Cta";
import { useAccount } from "@/hooks/useAccount";
import { type MyOrder, useOrders } from "@/hooks/useOrders";
import { usePortfolio } from "@/hooks/usePortfolio";
import { sideName, zec } from "@/lib/format";
import type { Position } from "@/lib/portfolio";

const TABS = ["Positions", "Open", "History"] as const;

const signed = (v: number) => `${v >= 0 ? "+" : "−"}${zec(Math.abs(v))} ZEC`;

/** One holding: average → last price, what it cost, what it pays if it wins, its value now. */
function Row({ p, question, now }: { p: Position; question: string; now: number | null }) {
	return (
		<tr className={p.hedged ? "is-hedge" : undefined}>
			<td>
				<Link href={`/trade/?m=${p.market}`}>{question}</Link>{" "}
				<span className="dim">
					{sideName(p.side)} · {p.shares} share{p.shares === 1 ? "" : "s"}
				</span>
				{p.hedged && <Badge>Self-trade</Badge>}
			</td>
			<td className="num">
				{(p.cost / p.shares / 2).toFixed(1)}¢ → {now === null ? "—" : `${now}¢`}
			</td>
			<td className="num">{zec(p.cost)}</td>
			<td className="num">{zec(p.shares * 200)}</td>
			<td className="num">
				{p.value === null ? "—" : zec(p.value)}
				{p.value !== null && <span className="dim"> {signed(p.value - p.cost)}</span>}
			</td>
		</tr>
	);
}

function OrderRow({ o, question }: { o: MyOrder; question: string }) {
	const filled = o.fill?.filled;
	return (
		<tr className={o.counterOf ? "is-hedge" : undefined}>
			<td>
				<Link href={`/trade/?m=${o.market}`}>{question}</Link>{" "}
				<span className="dim">
					{sideName(o.side)} · {o.size} @ ≤ {o.price}¢
				</span>
				{o.counterOf && <Badge>Self-trade</Badge>}
			</td>
			<td>{new Date(o.at).toLocaleString()}</td>
			<td className="num">{filled ? `${o.fill?.size} filled` : o.status}</td>
		</tr>
	);
}

/**
 * The account page, laid out like Polymarket's: who you are (the public account id, never
 * the tag), the portfolio total and cash with Deposit and Withdraw, P&L, then positions, open
 * orders and history. Everything is computed in this browser from its own fills.
 */
export default function PortfolioScreen() {
	const { tag } = useAccount();
	const { orders } = useOrders();
	const { cash, held, invested, total, markets } = usePortfolio();
	const router = useRouter();
	const [tab, setTab] = useState(0);
	const [withdraw, setWithdraw] = useState(false);
	const market = (id: number) => markets.find((m) => m.id === id);
	const question = (id: number) => market(id)?.question ?? `Market ${id}`;
	const now = (p: Position) => {
		const last = market(p.market)?.lastPrice;
		return last === undefined ? null : Math.round(p.side === 0 ? last : 100 - last);
	};
	if (!tag)
		return (
			<section className="portfolio">
				<h1 className="portfolio__title">Account</h1>
				<p>
					No account in this browser yet. <Link href="/faucet/">Get testnet ZEC →</Link>
				</p>
			</section>
		);
	const id = accountHex(tag);
	const pnl = held.reduce((n, p) => n + (p.value === null ? 0 : p.value - p.cost), 0);
	const open = orders.filter((o) => o.status === "pending");
	const history = [...orders].sort((a, b) => b.at - a.at);
	return (
		<section aria-labelledby="portfolio-title" className="portfolio">
			<div className="portfolio__cards">
				<div className="pcard">
					<div className="pcard__who">
						<span
							aria-hidden="true"
							className="acct__avatar acct__avatar--big"
							style={{ background: `hsl(${hue(id)} 70% 55%)` }}
						/>
						<div>
							<h1 className="portfolio__title" id="portfolio-title">
								Your account
							</h1>
							<p className="acct__id">
								{id.slice(0, 6)}…{id.slice(-4)} <CopyButton label="Copy" text={id} />
							</p>
						</div>
					</div>
					<div className="pcard__nums">
						<div>
							<p className="pcard__k">Portfolio</p>
							<p className="pcard__big">{total === null ? "…" : <Amount halfTicks={total} />}</p>
						</div>
						<div className="pcard__right">
							<p className="pcard__k">Available to trade</p>
							<p className="pcard__mid">{cash === null ? "…" : <Amount halfTicks={cash} />}</p>
							<p className="dim">
								Positions <Amount halfTicks={invested} usd={false} />
							</p>
						</div>
					</div>
					<div className="pcard__actions">
						<Cta onClick={() => router.push("/wallet/")}>Deposit</Cta>
						<button className="pcard__ghost" onClick={() => setWithdraw((w) => !w)} type="button">
							Withdraw
						</button>
					</div>
					<div hidden={!withdraw} id="withdraw">
						<WithdrawForm />
					</div>
				</div>
				<div className="pcard">
					<p className="pcard__k">Profit / loss</p>
					<p className="pcard__big num">{signed(pnl)}</p>
					<p className="dim">
						At the last public prices, or the payout once a market resolves. Self-trade pairs net
						out at resolution.
					</p>
				</div>
			</div>

			<div aria-label="Your activity" className="dtabs__list" role="tablist">
				{TABS.map((t, i) => (
					<button
						aria-selected={tab === i}
						className="dtabs__tab"
						key={t}
						onClick={() => setTab(i)}
						role="tab"
						type="button"
					>
						{t}
					</button>
				))}
			</div>
			{tab === 0 &&
				(held.length === 0 ? (
					<p className="dim">
						No positions yet. <Link href="/">Pick a market →</Link>
					</p>
				) : (
					<table className="portfolio__table">
						<thead>
							<tr>
								<th>Market</th>
								<th className="num">Avg → now</th>
								<th className="num">Traded</th>
								<th className="num">To win</th>
								<th className="num">Value</th>
							</tr>
						</thead>
						<tbody>
							{held.map((p) => (
								<Row
									key={`${p.market}:${p.side}:${p.hedged}`}
									now={now(p)}
									p={p}
									question={question(p.market)}
								/>
							))}
						</tbody>
					</table>
				))}
			{tab !== 0 &&
				((tab === 1 ? open : history).length === 0 ? (
					<p className="dim">{tab === 1 ? "No open orders." : "No orders yet."}</p>
				) : (
					<table className="portfolio__table">
						<thead>
							<tr>
								<th>Order</th>
								<th>Placed</th>
								<th className="num">Status</th>
							</tr>
						</thead>
						<tbody>
							{(tab === 1 ? open : history).map((o) => (
								<OrderRow key={o.orderId} o={o} question={question(o.market)} />
							))}
						</tbody>
					</table>
				))}
			<p className="dim">
				Only this browser knows your holdings and orders: it combines your fills from three random
				shares, and the relayers never learn them.
			</p>
		</section>
	);
}
