import type { Market } from "@zpredict/sdk";
import Link from "next/link";
import Badge from "@/components/ui/Badge";

export default function MarketHeader({ market: m }: { market: Market }) {
	return (
		<header className="mhead">
			<div className="mhead__meta">
				<Link className="mhead__back" href="/">
					← Markets
				</Link>
				<Badge size="sm">{m.plugin}</Badge>
				<Badge size="sm" tone={m.status === "open" ? "live" : "default"}>
					{m.status}
				</Badge>
			</div>
			<h1 className="mhead__q">{m.question}</h1>
			<p className="mhead__heights num">
				Closes {m.closeHeight.toLocaleString("en-US")} · resolves{" "}
				{m.resolveHeight.toLocaleString("en-US")}
				{m.outcome && ` · outcome ${m.outcome.toUpperCase()}`}
			</p>
		</header>
	);
}
