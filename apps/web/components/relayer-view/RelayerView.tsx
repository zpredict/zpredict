"use client";
import type { ViewItem } from "@zpredict/sdk";
import ScrambleHeading from "@/components/ui/ScrambleHeading";
import { useHealth } from "@/hooks/useHealth";
import type { MyOrder } from "@/hooks/useOrders";
import RelayerPanel from "./RelayerPanel";

interface Props {
	views: ViewItem[][];
	online: boolean[];
	/** Digests of this browser's own shares (`digestsOf`). */
	mine: Set<string>;
	/** The trader's latest order, pinned in every panel. */
	focus?: MyOrder;
}

/** The relayers' side of the split screen: three machines, three streams of noise. */
export default function RelayerView({ views, online, mine, focus }: Props) {
	const health = useHealth();
	return (
		<div className="rview">
			<header className="rview__head">
				<p className="rview__eyebrow">Relayer View / live</p>
				<ScrambleHeading
					className="rview__title"
					lines={["None of these machines", "knows what you bet."]}
				/>
				<p className="rview__legend">
					<span aria-hidden="true" className="swatch" /> your order&apos;s shares · the public feed
					shows a digest of each share, never the share
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
