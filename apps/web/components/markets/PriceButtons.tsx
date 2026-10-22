import type { Market } from "@zpredict/sdk";
import Link from "next/link";
import { sideCents } from "@/lib/markets";

const cents = (c: number | null) => (c === null ? "—" : `${c}¢`);

/** "Yes 71¢ / No 29¢": each opens the ticket on that side at that price. */
export default function PriceButtons({ market: m }: { market: Market }) {
	const yes = sideCents(m, 0);
	const no = sideCents(m, 1);
	return (
		<div className="prices">
			<Link
				aria-label={`Buy Yes ${cents(yes)}`}
				className="price price--yes"
				href={`/trade/?m=${m.id}&side=yes`}
			>
				Yes <strong className="num">{cents(yes)}</strong>
			</Link>
			<Link
				aria-label={`Buy No ${cents(no)}`}
				className="price price--no"
				href={`/trade/?m=${m.id}&side=no`}
			>
				No <strong className="num">{cents(no)}</strong>
			</Link>
		</div>
	);
}
