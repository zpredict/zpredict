import type { Market } from "@zpredict/sdk";
import { isMirrored } from "@/lib/markets";

/** Frequently asked questions, answered for this market. */
export default function DetailFaq({ market: m }: { market: Market }) {
	const title = m.event?.title ?? m.question;
	const faq = [
		[
			`What is the "${title}" market?`,
			"A YES/NO prediction market on zPredict. A YES share pays 0.01 ZEC if the outcome is YES, a NO share if it is NO. A share at 60¢ costs 60% of that, 0.006 ZEC, and the price is the market's public estimate of the chance.",
		],
		[
			"Who can see that I traded?",
			"Nobody else. Your browser splits each order into three random shares, one per relayer, and they match orders inside 3-party MPC. Only the clearing price is published; bettors, sides and sizes are not. The threat model lists the limits of this hosted demo.",
		],
		[
			"Why did my order not fill?",
			"Orders cross only inside the 5-second batch they land in, so a fill needs someone on the other side in that batch. In judge mode your demo account places that counter-order itself, a labelled self-trade.",
		],
		[
			"How is it resolved?",
			isMirrored(m)
				? "From Polymarket's public result, fetched by each relayer on its own and signed by 2 of 3 relayers once all three agree."
				: "From Zcash mainnet block data, read by each relayer on its own and signed by 2 of 3 relayers once all three agree. Your browser checks the signature.",
		],
		[
			"What are the current odds?",
			m.lastPrice === undefined
				? "No trade has crossed yet."
				: `The last cross was at ${m.lastPrice}¢ for YES, a ${Math.round(m.lastPrice)}% chance.`,
		],
	];
	return (
		<section aria-labelledby="faq-title" className="dfaq">
			<h2 className="dsec__title" id="faq-title">
				Frequently asked questions
			</h2>
			{faq.map(([q, a]) => (
				<details className="dfaq__item" key={q}>
					<summary>{q}</summary>
					<p>{a}</p>
				</details>
			))}
		</section>
	);
}
