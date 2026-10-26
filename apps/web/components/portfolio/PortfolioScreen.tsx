"use client";
import Link from "next/link";
import Amount from "@/components/ui/Amount";
import Badge from "@/components/ui/Badge";
import { useAccount } from "@/hooks/useAccount";
import { usePortfolio } from "@/hooks/usePortfolio";
import { sideName, zec } from "@/lib/format";
import type { Position } from "@/lib/portfolio";

/** One holding: value at the last price (or the payout once resolved) and P&L against its cost. */
function Row({ p, question }: { p: Position; question: string }) {
	const pnl = p.value === null ? null : p.value - p.cost;
	return (
		<tr className={p.hedged ? "is-hedge" : undefined}>
			<td>
				<Link href={`/trade/?m=${p.market}`}>{question}</Link>
				{p.hedged && <Badge>Self-trade</Badge>}
			</td>
			<td>{sideName(p.side)}</td>
			<td className="num">{p.shares}</td>
			<td className="num">{(p.cost / p.shares / 2).toFixed(1)}¢</td>
			<td className="num">
				{p.value === null ? "no price yet" : <Amount halfTicks={p.value} usd={false} />}
			</td>
			<td className="num">
				{pnl === null ? "—" : `${pnl >= 0 ? "+" : "−"}${zec(Math.abs(pnl))} ZEC`}
			</td>
		</tr>
	);
}

/** /portfolio: cash, holdings and their value, computed in this browser from its own fills. */
export default function PortfolioScreen() {
	const { tag } = useAccount();
	const { cash, held, invested, total, markets } = usePortfolio();
	const question = (id: number) => markets.find((m) => m.id === id)?.question ?? `Market ${id}`;
	return (
		<section aria-labelledby="portfolio-title" className="portfolio">
			<h1 className="portfolio__title" id="portfolio-title">
				Portfolio
			</h1>
			<p className="dim">
				Only this browser knows your holdings: it combines your fills from three random shares. The
				relayers never learn them.
			</p>
			{!tag ? (
				<p>
					No account in this browser yet. <Link href="/faucet/">Get testnet ZEC →</Link>
				</p>
			) : (
				<>
					<dl className="portfolio__sum">
						<div>
							<dt>Total</dt>
							<dd>{total === null ? "…" : <Amount halfTicks={total} />}</dd>
						</div>
						<div>
							<dt>Cash</dt>
							<dd>{cash === null ? "…" : <Amount halfTicks={cash} />}</dd>
						</div>
						<div>
							<dt>Positions</dt>
							<dd>
								<Amount halfTicks={invested} />
							</dd>
						</div>
					</dl>
					{held.length === 0 ? (
						<p className="dim">
							No positions yet. <Link href="/">Pick a market →</Link>
						</p>
					) : (
						<table className="portfolio__table">
							<thead>
								<tr>
									<th>Market</th>
									<th>Side</th>
									<th className="num">Shares</th>
									<th className="num">Avg</th>
									<th className="num">Value</th>
									<th className="num">P&amp;L</th>
								</tr>
							</thead>
							<tbody>
								{held.map((p) => (
									<Row
										key={`${p.market}:${p.side}:${p.hedged}`}
										p={p}
										question={question(p.market)}
									/>
								))}
							</tbody>
						</table>
					)}
					<p className="dim">
						Self-trade rows are the demo counterparty: the opposite side your own account bought
						with each order, so it fills. Together they net out at resolution.
					</p>
					<Link href="/wallet/">Deposit or withdraw →</Link>
				</>
			)}
		</section>
	);
}
