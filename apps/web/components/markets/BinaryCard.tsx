import type { Market } from "@zpredict/sdk";
import Link from "next/link";
import { chance } from "@/lib/markets";
import CardFoot from "./CardFoot";
import ChanceRing from "./ChanceRing";
import Glyph from "./Glyph";
import PriceButtons from "./PriceButtons";

/** A single YES/NO market: glyph, question, chance ring, Buy Yes / Buy No. */
export default function BinaryCard({ market: m, tip }: { market: Market; tip: number | null }) {
	return (
		<article className="mcard">
			<header className="mcard__head">
				<Glyph market={m} />
				<h3 className="mcard__q">
					<Link href={`/trade/?m=${m.id}`}>{m.question}</Link>
				</h3>
				<ChanceRing pct={chance(m)} />
			</header>
			<PriceButtons market={m} />
			<CardFoot market={m} tip={tip} />
		</article>
	);
}
