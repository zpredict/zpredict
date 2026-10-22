import type { ViewItem } from "@zpredict/sdk";
import { bytes } from "@/lib/format";

interface Props {
	item: ViewItem;
	mine: boolean;
}

/** One share as a relayer received it: random bytes, unless it's yours, then highlighted. */
export default function ViewRow({ item, mine }: Props) {
	return (
		<li className={`vrow vrow--${item.kind}${mine ? " is-mine" : ""}`}>
			<span className="vrow__meta">
				<span className="vrow__seq">#{item.seq}</span>
				<span className="vrow__kind">{item.kind}</span>
				<span className="vrow__id">{item.orderId.slice(0, 8)}</span>
				{mine && <span className="vrow__you">you</span>}
			</span>
			<span className="vrow__share">{bytes(item.share).join(" ")}</span>
		</li>
	);
}
