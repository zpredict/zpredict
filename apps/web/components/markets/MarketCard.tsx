import type { Market } from "@zpredict/sdk";
import Link from "next/link";
import Badge from "@/components/ui/Badge";

export default function MarketCard({ market: m }: { market: Market }) {
	return (
		<Link className="mcard" href={`/trade/?m=${m.id}`}>
			<span className="mcard__meta">
				<Badge size="sm">{m.plugin}</Badge>
				<Badge size="sm" tone={m.status === "open" ? "live" : "default"}>
					{m.status}
				</Badge>
			</span>
			<span className="mcard__q">{m.question}</span>
			<span className="mcard__foot">
				<span>Closes at height {m.closeHeight.toLocaleString("en-US")}</span>
				<span className="mcard__go">Trade →</span>
			</span>
		</Link>
	);
}
