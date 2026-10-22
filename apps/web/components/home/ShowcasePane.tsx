import type { Market } from "@zpredict/sdk";
import MarketCard from "@/components/markets/MarketCard";
import Pane from "@/components/ui/Pane";

/** Right pane: the template's looping terrain video under the featured market. */
export default function ShowcasePane({ featured }: { featured?: Market }) {
	return (
		<Pane aria-label="Featured market" className="showcase" variant="media">
			<div aria-hidden="true" className="showcase__media">
				<video
					autoPlay
					className="showcase__video"
					loop
					muted
					playsInline
					poster="/media/poster.webp"
					preload="auto"
					src="/media/hero.mp4"
				/>
			</div>
			<div className="showcase__shade" />
			<p className="showcase__eyebrow">Featured · resolves from Zcash chain data</p>
			<div className="showcase__card">
				{featured && <MarketCard market={featured} variant="glass" />}
			</div>
		</Pane>
	);
}
