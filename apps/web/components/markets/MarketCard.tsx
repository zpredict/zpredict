import type { Market } from "@zpredict/sdk";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import { category, chance, heightLabel } from "@/lib/markets";
import Chance from "./Chance";
import PriceButtons from "./PriceButtons";
import PrivacyChips from "./PrivacyChips";
import ProbabilityBar from "./ProbabilityBar";
import Sparkline from "./Sparkline";

interface Props {
	market: Market;
	/** `glass` sits on the hero video; `solid` in the grid. */
	variant?: "solid" | "glass";
	/** Heading level for the question: 2 where the card sits right under the page's h1. */
	level?: 2 | 3;
}

/**
 * The prediction-market card, matching the landing's MarketCard: category and block,
 * question, chance with sparkline, probability bar, Yes/No prices, what stays hidden.
 */
export default function MarketCard({ market: m, variant = "solid", level = 3 }: Props) {
	const Question = level === 2 ? "h2" : "h3";
	return (
		<article className={`mcard mcard--${variant}`}>
			<header className="mcard__top">
				<Badge size="sm">{category(m)}</Badge>
				<span className="mcard__height num">Block {heightLabel(m.resolveHeight)}</span>
			</header>
			<Question className="mcard__q">
				<Link href={`/trade/?m=${m.id}`}>{m.question}</Link>
			</Question>
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
