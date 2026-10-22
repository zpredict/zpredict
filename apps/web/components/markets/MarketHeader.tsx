import type { Market } from "@zpredict/sdk";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import { useGroupKey } from "@/hooks/useGroupKey";
import { useTip } from "@/hooks/useTip";
import { category, chance, heightLabel } from "@/lib/markets";
import Chance from "./Chance";
import Countdown from "./Countdown";
import OutcomeProof from "./OutcomeProof";
import PrivacyChips from "./PrivacyChips";
import ProbabilityBar from "./ProbabilityBar";
import Sparkline from "./Sparkline";

/** Trade page header: the market card's information, laid out for the trader pane. */
export default function MarketHeader({ market: m }: { market: Market }) {
	const tip = useTip();
	const groupKey = useGroupKey();
	return (
		<header className="mhead">
			<div className="mhead__meta">
				<Link className="mhead__back" href="/">
					← Markets
				</Link>
				<Badge>{category(m)}</Badge>
				<Badge tone={m.status === "open" ? "live" : "default"}>{m.status}</Badge>
			</div>
			<h1 className="mhead__q">{m.question}</h1>
			<div className="mcard__odds">
				<Chance market={m} />
				<Sparkline className="mcard__spark" points={m.history ?? []} />
			</div>
			<ProbabilityBar yes={chance(m)} />
			<p className="mhead__heights num">
				Closes {heightLabel(m.closeHeight)} · resolves at block {heightLabel(m.resolveHeight)}
			</p>
			<Countdown market={m} tip={tip} />
			<OutcomeProof groupKey={groupKey} market={m} />
			<PrivacyChips />
		</header>
	);
}
