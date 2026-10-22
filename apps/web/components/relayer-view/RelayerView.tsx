"use client";
import type { ViewItem } from "@zpredict/sdk";
import { useHealth } from "@/hooks/useHealth";
import type { Seen } from "@/hooks/useRelayerView";
import RelayerPanel from "./RelayerPanel";

interface Props {
	views: ViewItem[][];
	online: boolean[];
	mine: Set<string>;
	/** The trader's latest order, pinned in every panel. */
	focus?: { orderId: string; seen?: Seen };
}

/** The relayers' side of the split screen: three machines, three streams of noise. */
export default function RelayerView({ views, online, mine, focus }: Props) {
	const health = useHealth();
	return (
		<div className="rview">
			<header className="rview__head">
				<p className="rview__eyebrow">Relayer View · live</p>
				<h2 className="rview__title">
					None of these machines
					<br />
					knows what you bet
				</h2>
				<p className="rview__legend">
					<span aria-hidden="true" className="swatch" /> your order&apos;s shares
				</p>
			</header>
			<div className="rview__grid">
				{[0, 1, 2].map((i) => (
					<RelayerPanel
						focus={focus}
						health={health[i]}
						index={i}
						items={views[i]}
						key={i}
						mine={mine}
						online={online[i]}
					/>
				))}
			</div>
		</div>
	);
}
