import type { Market } from "@zpredict/sdk";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import { category, chance, heightLabel } from "@/lib/markets";
import Chance from "./Chance";
import PrivacyChips from "./PrivacyChips";
import ProbabilityBar from "./ProbabilityBar";
import Sparkline from "./Sparkline";

/** Trade page header: the market card's information, laid out for the trader pane. */
export default function MarketHeader({ market: m }: { market: Market }) {
	return (
		<header className="mhead">
			<div className="mhead__meta">
				<Link className="mhead__back" href="/">
					← Markets
				</Link>
				<Badge size="sm">{category(m)}</Badge>
				<Badge size="sm" tone={m.status === "open" ? "live" : "default"}>
					{m.status}
				</Badge>
			</div>
			<h1 className="mhead__q">{m.question}</h1>
			<div className="mcard__odds">
				<Chance market={m} />
				<Sparkline className="mcard__spark" points={m.history ?? []} />
			</div>
			<ProbabilityBar yes={chance(m)} />
			<p className="mhead__heights num">
				Closes {heightLabel(m.closeHeight)} · resolves at block {heightLabel(m.resolveHeight)}
				{m.outcome && ` · outcome ${m.outcome.toUpperCase()}`}
			</p>
			<PrivacyChips />
		</header>
	);
}
