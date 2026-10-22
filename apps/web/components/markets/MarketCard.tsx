import type { Market } from "@zpredict/sdk";
import Link from "next/link";
import { category, chance, heightLabel } from "@/lib/markets";
import Chance from "./Chance";
import PriceButtons from "./PriceButtons";
import PrivacyChips from "./PrivacyChips";
import ProbabilityBar from "./ProbabilityBar";
import Sparkline from "./Sparkline";

/**
 * The prediction-market card, square and mono: category and block, question, chance with
 * sparkline, ASCII probability bar, Yes/No prices, what stays hidden.
 */
export default function MarketCard({ market: m }: { market: Market }) {
	return (
		<article className="mcard">
			<header className="mcard__top">
				<span>{category(m)}</span>
				<span className="num">Block {heightLabel(m.resolveHeight)}</span>
			</header>
			<h3 className="mcard__q">
				<Link href={`/trade/?m=${m.id}`}>{m.question}</Link>
			</h3>
			<div className="mcard__odds">
				<Chance market={m} />
				<Sparkline className="mcard__spark" points={m.history ?? []} />
			</div>
			<ProbabilityBar yes={chance(m)} />
			<PriceButtons market={m} />
			<PrivacyChips />
		</article>
	);
}
