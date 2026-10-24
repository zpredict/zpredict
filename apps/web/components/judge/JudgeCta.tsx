"use client";
import Badge from "@/components/ui/Badge";
import Cta from "@/components/ui/Cta";
import { useJudge } from "@/hooks/useJudge";

/** Hero CTA for judge mode, labelled as the demo mock it is. */
export default function JudgeCta() {
	const { start, busy, error, label, hasAccount } = useJudge();
	return (
		<div className="judge">
			<Cta disabled={busy} onClick={start}>
				{label}
			</Cta>
			<p className="judge__note">
				<Badge tone="mock">Mock</Badge>
				{error ||
					(hasAccount
						? "Demo account ready in this browser."
						: "Credits a fresh testnet demo account with 0.25 ZEC. No wallet, no deposit.")}
			</p>
		</div>
	);
}
