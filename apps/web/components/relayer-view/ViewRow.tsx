"use client";
import type { ViewItem } from "@zpredict/sdk";
import { useEffect, useRef } from "react";
import { bytes } from "@/lib/format";
import { scrambler } from "@/lib/scramble";

interface Props {
	item?: ViewItem;
	mine: boolean;
	/** Arrived since the last poll: its bytes scramble in once. */
	fresh: boolean;
}

/** One fixed-height slot of a relayer's feed: one share as it arrived, or empty. */
export default function ViewRow({ item, mine, fresh }: Props) {
	return (
		<li className={`vrow${item ? ` vrow--${item.kind}` : ""}${mine ? " is-mine" : ""}`}>
			{item && (
				<>
					<span className="vrow__meta">
						<span>#{item.seq}</span>
						<span className="vrow__kind">{item.kind}</span>
						<span>{item.orderId.slice(0, 8)}</span>
						{mine && <span className="vrow__you">you</span>}
					</span>
					{/* Keyed by seq: the scrambler writes this span's text, React never updates it in place. */}
					<Hex fresh={fresh} hex={bytes(item.share).join(" ")} key={item.seq} />
				</>
			)}
		</li>
	);
}

function Hex({ hex, fresh }: { hex: string; fresh: boolean }) {
	const ref = useRef<HTMLSpanElement>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: scramble once, on arrival only
	useEffect(() => {
		if (!fresh || !ref.current) return;
		const s = scrambler(ref.current, hex);
		s.once();
		return s.cancel;
	}, []);
	return (
		<span className="vrow__share" ref={ref}>
			{hex}
		</span>
	);
}
