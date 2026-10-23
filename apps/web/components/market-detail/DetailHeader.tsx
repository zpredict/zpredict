import type { Market } from "@zpredict/sdk";
import Link from "next/link";
import DocumentTitle from "@/components/layout/DocumentTitle";
import Glyph from "@/components/markets/Glyph";
import PrivacyChips from "@/components/markets/PrivacyChips";
import Badge from "@/components/ui/Badge";
import { topicLine } from "@/lib/markets";

/** Category line, title (the event's, for a grouped market), status and what stays hidden. */
export default function DetailHeader({ market: m, group }: { market: Market; group: Market[] }) {
	const title = m.event?.title ?? m.question;
	return (
		<header className="dhead">
			<DocumentTitle title={title} />
			<Glyph market={m} size="lg" />
			<div className="dhead__text">
				<p className="dhead__cat">
					<Link href="/">Markets</Link> · {topicLine(m)}
				</p>
				<h1 className="dhead__title">{title}</h1>
				{group.length > 1 && <p className="dhead__sub">{m.question}</p>}
			</div>
			<div className="dhead__meta">
				<Badge tone={m.status === "open" ? "live" : "default"}>{m.status}</Badge>
				<PrivacyChips market={m} />
			</div>
		</header>
	);
}
