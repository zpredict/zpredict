import type { Health, ViewItem } from "@zpredict/sdk";
import type { Seen } from "@/hooks/useRelayerView";
import { relayerHost } from "@/lib/relayer";
import PinnedShare from "./PinnedShare";
import ViewRow from "./ViewRow";

interface Props {
	index: number;
	items: ViewItem[];
	health: Health | null;
	online: boolean;
	mine: Set<string>;
	focus?: { orderId: string; seen?: Seen };
}

/** Everything one relayer receives, newest first. */
export default function RelayerPanel({ index, items, health, online, mine, focus }: Props) {
	const up = online && health !== null;
	const newestFirst = items.slice().reverse();
	return (
		<article aria-label={`Relayer ${index}`} className="rpanel">
			<header className="rpanel__head">
				<span aria-hidden="true" className={`dot${up ? " is-up" : ""}`} />
				<span className="rpanel__name">Relayer {index}</span>
				<span className="rpanel__host">{relayerHost(index)}</span>
			</header>
			<p className="rpanel__stats num">
				{health
					? `height ${health.height.toLocaleString("en-US")} · batch ${health.batch}`
					: "unreachable"}
			</p>
			{focus && (
				<PinnedShare
					fill={focus.seen?.fill[index]}
					order={focus.seen?.order[index]}
					orderId={focus.orderId}
				/>
			)}
			<ol className="rpanel__stream">
				{newestFirst.map((it) => (
					<ViewRow item={it} key={it.seq} mine={mine.has(it.orderId)} />
				))}
			</ol>
			<footer className="rpanel__foot">Holds 1 of 3 shares. Alone it decodes nothing.</footer>
		</article>
	);
}
