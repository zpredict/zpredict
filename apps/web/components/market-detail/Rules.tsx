"use client";
import type { Market } from "@zpredict/sdk";
import Countdown from "@/components/markets/Countdown";
import OutcomeProof from "@/components/markets/OutcomeProof";
import { useGroupKey } from "@/hooks/useGroupKey";
import { useTip } from "@/hooks/useTip";
import { heightLabel } from "@/lib/markets";

const n = (v: unknown) => (typeof v === "number" ? v.toLocaleString("en-US") : "?");

/** What YES means, from the resolver plugin and its params (packages/plugins/*). */
function rule(m: Market): string {
	const p = m.params;
	const at = heightLabel(m.resolveHeight);
	switch (m.plugin) {
		case "nu7-activation":
			return `Resolves YES if the coinbase transaction of mainnet block ${n(p.activationHeight)} carries the NU7 consensus branch ID, otherwise NO.`;
		case "ironwood-pool":
			return `Resolves YES if at least ${n(p.minNotes)} Ironwood note commitments exist (the commitment tree size) at the end of mainnet block ${at}, otherwise NO.`;
		case "shielded-actions":
			return `Resolves YES if mainnet block ${at} contains at least ${n(p.minActions)} shielded actions (Sapling spends and outputs, Orchard and Ironwood actions), otherwise NO.`;
		case "polymarket":
			return "Mirrors a Polymarket market: resolves the way Polymarket resolves it (UMA's oracle). Trading here is private; the two books are separate.";
		default:
			return `Resolved by the ${m.plugin} plugin at block ${at}.`;
	}
}

/** Rules: what YES means, the resolution source and how the outcome is signed, and the heights. */
export default function Rules({ market: m }: { market: Market }) {
	const tip = useTip();
	const groupKey = useGroupKey();
	const first = m.historyAt?.[0];
	const mirrored = m.plugin === "polymarket";
	return (
		<section aria-labelledby="rules-title" className="rules">
			<h2 className="dsec__title" id="rules-title">
				Rules
			</h2>
			<p>{rule(m)}</p>
			<p className="dim">
				{mirrored
					? "Each relayer fetches Polymarket's public result on its own; the outcome is published only when all three agree, signed by 2 of 3 (FROST), and your browser checks the signature. Market data from Polymarket; not affiliated."
					: "Each relayer reads the block from Zcash mainnet on its own; the outcome is published only when all three agree, signed by 2 of 3 (FROST), and your browser checks the signature."}
			</p>
			<dl className="rules__facts">
				<dt>Trading closes</dt>
				<dd className="num">Block {heightLabel(m.closeHeight)}</dd>
				<dt>Resolves</dt>
				<dd className="num">
					{mirrored ? "When Polymarket resolves" : `Block ${heightLabel(m.resolveHeight)}`}
				</dd>
				{first !== undefined && (
					<>
						<dt>First cross</dt>
						<dd className="num">{new Date(first * 1000).toLocaleString("en-US")}</dd>
					</>
				)}
			</dl>
			<Countdown market={m} tip={tip} />
			<OutcomeProof groupKey={groupKey} market={m} />
		</section>
	);
}
