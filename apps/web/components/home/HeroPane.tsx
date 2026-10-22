import JudgeCta from "@/components/judge/JudgeCta";
import Badge from "@/components/ui/Badge";
import Pane from "@/components/ui/Pane";

export default function HeroPane() {
	return (
		<Pane className="hero__content">
			<Badge>Zcash · Private Markets</Badge>
			<h1 className="hero__title">
				<span className="hero__line">Bet</span>
				<span className="hero__line">without</span>
				<span className="hero__line">being seen</span>
			</h1>
			<p className="hero__lede">
				A prediction market where no chain observer, no operator and no counterparty learns who bet,
				which side, or how much.
			</p>
			<JudgeCta />
		</Pane>
	);
}
