"use client";
import type { Market } from "@zpredict/sdk";
import Countdown from "@/components/markets/Countdown";
import OutcomeProof from "@/components/markets/OutcomeProof";
import Reference from "@/components/markets/Reference";
import { useGroupKey } from "@/hooks/useGroupKey";
import { useTip } from "@/hooks/useTip";
import { heightLabel, isMirrored } from "@/lib/markets";

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
			return "Mirrors the Polymarket market of the same question: YES if Polymarket settles it Yes once UMA's answer is final, otherwise NO (a 50-50 settlement is NO). Trading here is private, on zPredict's own book.";
		default:
			return `Resolved by the ${m.plugin} plugin at block ${at}.`;
	}
}

/** Rules: what YES means, the resolution source and how the outcome is signed, and the heights. */
export default function Rules({ market: m }: { market: Market }) {
	const tip = useTip();
	const groupKey = useGroupKey();
	const first = m.historyAt?.find((t) => t > 0);
	const mirrored = isMirrored(m);
	return (
		<section aria-labelledby="rules-title" className="rules">
			<h2 className="dsec__title" id="rules-title">
				Rules
			</h2>
			<p>{m.rules ?? rule(m)}</p>
			<Reference market={m} />
			<p className="dim">
				{mirrored
					? "Each relayer reads Polymarket's public result on its own; the outcome is published only when all three agree, signed by 2 of 3 (FROST), and your browser checks the signature. Polymarket (UMA) is this market's oracle."
					: "Each relayer reads the block from Zcash mainnet on its own; the outcome is published only when all three agree, signed by 2 of 3 (FROST), and your browser checks the signature."}
			</p>
			<dl className="rules__facts">
				<dt>Trading closes</dt>
				<dd className="num">Block {heightLabel(m.closeHeight)}</dd>
				<dt>Resolves</dt>
				<dd className="num">
					{mirrored ? "When Polymarket resolves" : `Block ${heightLabel(m.resolveHeight)}`}
				</dd>
				{m.opensAt && (
					<>
						<dt>Market opened</dt>
						<dd className="num">{new Date(m.opensAt).toLocaleString("en-US")}</dd>
					</>
				)}
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
