import type { Market } from "@zpredict/sdk";

const ROWS = 20;

/** The public clearing prices, newest first: the only market data anyone can see. */
export default function PriceTable({ market: m }: { market: Market }) {
	const prices = m.history ?? [];
	if (prices.length === 0) return <p className="dim">No crosses yet.</p>;
	const rows = prices
		.map((p, i) => ({ p, at: m.historyAt?.[i], i }))
		.reverse()
		.slice(0, ROWS);
	return (
		<table className="ptable">
			<caption className="dim">
				One price per batch that crossed. Sizes, counts and traders are never published.
			</caption>
			<thead>
				<tr>
					<th scope="col">When</th>
					<th scope="col">YES</th>
					<th scope="col">NO</th>
				</tr>
			</thead>
			<tbody>
				{rows.map((r) => (
					<tr key={r.i}>
						<td>{r.at ? new Date(r.at * 1000).toLocaleString("en-US") : `Cross ${r.i + 1}`}</td>
						<td className="num">{r.p.toFixed(1)}¢</td>
						<td className="num">{(100 - r.p).toFixed(1)}¢</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}
