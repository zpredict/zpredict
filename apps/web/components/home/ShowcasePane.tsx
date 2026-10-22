import MarketList from "@/components/markets/MarketList";
import Pane from "@/components/ui/Pane";

/** Right pane: the template's looping terrain video under the live market list. */
export default function ShowcasePane() {
	return (
		<Pane aria-label="Markets" className="showcase" variant="media">
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
			<p className="showcase__eyebrow">Markets resolve from Zcash chain data</p>
			<MarketList />
		</Pane>
	);
}
