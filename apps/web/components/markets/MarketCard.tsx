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
}

/**
 * The prediction-market card, matching the landing's MarketCard: category and block,
 * question, chance with sparkline, probability bar, Yes/No prices, what stays hidden.
 */
export default function MarketCard({ market: m, variant = "solid" }: Props) {
	return (
		<article className={`mcard mcard--${variant}`}>
			<header className="mcard__top">
				<Badge size="sm">{category(m)}</Badge>
				<span className="mcard__height num">Block {heightLabel(m.resolveHeight)}</span>
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
