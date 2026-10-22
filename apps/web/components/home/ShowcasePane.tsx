import type { Market } from "@zpredict/sdk";
import { useEffect, useRef } from "react";
import { preload } from "react-dom";
import MarketCard from "@/components/markets/MarketCard";
import Pane from "@/components/ui/Pane";

const POSTER = "/media/poster.webp";
const VIDEO = "/media/hero.mp4";

/** Right pane: the template's looping terrain video under the featured market. */
export default function ShowcasePane({ featured }: { featured?: Market }) {
	// The poster is the LCP image; the video is only fetched after load, on wide screens.
	preload(POSTER, { as: "image", fetchPriority: "high" });
	const video = useRef<HTMLVideoElement>(null);
	useEffect(() => {
		const el = video.current;
		if (!el) return;
		const play = () => {
			if (!matchMedia("(min-width: 800px) and (prefers-reduced-motion: no-preference)").matches)
				return;
			el.src = VIDEO;
			el.play().catch(() => {
				// The browser may refuse to play (e.g. data saver); the poster stays visible.
			});
		};
		if (document.readyState === "complete") play();
		else addEventListener("load", play, { once: true });
		return () => removeEventListener("load", play);
	}, []);

	return (
		<Pane aria-label="Featured market" className="showcase" variant="media">
			<div aria-hidden="true" className="showcase__media">
				<video
					className="showcase__video"
					loop
					muted
					playsInline
					poster={POSTER}
					preload="none"
					ref={video}
				/>
			</div>
			<div className="showcase__shade" />
			<p className="showcase__eyebrow">Featured · resolves from Zcash chain data</p>
			<div className="showcase__card">
				{featured && <MarketCard level={2} market={featured} variant="glass" />}
			</div>
		</Pane>
	);
}
