"use client";
import type { Health, ViewItem } from "@zpredict/sdk";
import { useEffect, useRef } from "react";
import type { Seen } from "@/hooks/useRelayerView";
import { relayerHost } from "@/lib/relayer";
import PinnedShare from "./PinnedShare";
import ViewRow from "./ViewRow";

/** Feed slots. Rows fill fixed slots in place, so new shares never push anything (no CLS). */
const SLOTS = 14;
/** Arrivals that scramble in, per poll. Not the first load, and not a whole batch burst: CPU. */
const SCRAMBLE_MAX = 3;

interface Props {
	index: number;
	items: ViewItem[];
	health: Health | null;
	online: boolean;
	mine: Set<string>;
	focus?: { orderId: string; seen?: Seen };
}

/** Everything one relayer receives, newest first, as an ASCII panel. */
export default function RelayerPanel({ index, items, health, online, mine, focus }: Props) {
	const up = online && health !== null;
	const newest = items.slice(-SLOTS).reverse();
	const top = newest[0]?.seq ?? 0;
	// Newest seq at the previous render: anything above it just arrived.
	const seenTop = useRef(top);
	useEffect(() => {
		seenTop.current = top;
	}, [top]);

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
			<PinnedShare
				fill={focus?.seen?.fill[index]}
				order={focus?.seen?.order[index]}
				orderId={focus?.orderId}
			/>
			<ol className="rpanel__stream">
				{Array.from({ length: SLOTS }, (_, i) => {
					const it = newest[i];
					return (
						<ViewRow
							fresh={
								i < SCRAMBLE_MAX &&
								seenTop.current > 0 &&
								it !== undefined &&
								it.seq > seenTop.current
							}
							item={it}
							// biome-ignore lint/suspicious/noArrayIndexKey: slots stay put; their content moves
							key={i}
							mine={it !== undefined && mine.has(it.orderId)}
						/>
					);
				})}
			</ol>
			<footer className="rpanel__foot">
				<span>Holds 1 of 3 shares</span>
				<span>Alone it decodes nothing</span>
			</footer>
		</article>
	);
}
