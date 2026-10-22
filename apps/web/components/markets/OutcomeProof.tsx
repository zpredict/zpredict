import { type Market, verifyOutcome } from "@zpredict/sdk";
import Badge from "@/components/ui/Badge";
import { heightLabel, shortHash } from "@/lib/markets";

/**
 * A resolved market's outcome and what backs it: the FROST 2-of-3 signature, checked here in
 * the browser against the group key all three relayers serve, and the block it came from.
 */
export default function OutcomeProof({
	market: m,
	groupKey,
}: {
	market: Market;
	groupKey: string | null;
}) {
	if (m.status !== "resolved" || !m.outcome) return null;
	const signed = groupKey !== null && verifyOutcome(m, groupKey);
	const sig = signed
		? "Signed by 2-of-3 relayers ✓"
		: m.outcomeSig
			? "Signature not verified"
			: "Resolved (unsigned)";
	return (
		<div className="proof">
			<div className="proof__row">
				<Badge tone={m.outcome === "yes" ? "yes" : "no"}>Outcome {m.outcome}</Badge>
				<span className={`proof__sig${signed ? " is-signed" : ""}`}>{sig}</span>
			</div>
			{m.blockHash && m.blockHeight !== undefined && (
				<p className="proof__block num" title={m.blockHash}>
					Block {heightLabel(m.blockHeight)} · <code>{shortHash(m.blockHash)}</code>
				</p>
			)}
		</div>
	);
}
