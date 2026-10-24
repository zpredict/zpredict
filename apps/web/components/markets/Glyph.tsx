"use client";
import type { Market } from "@zpredict/sdk";
import { useState } from "react";
import { isMirrored, topic } from "@/lib/markets";

/**
 * A market's square badge: a mirrored market's Polymarket image, fetched once by the
 * operator (scripts/polymarket-catalog.mjs) and served from our own origin, never from
 * Polymarket. Else, or if it fails to load, an ASCII letter: the first of its topic.
 */
export default function Glyph({ market, size = "sm" }: { market: Market; size?: "sm" | "lg" }) {
	const [broken, setBroken] = useState(false);
	if (isMirrored(market) && Number.isInteger(market.id) && !broken)
		return (
			// biome-ignore lint/performance/noImgElement: static export has no image optimizer
			<img
				alt=""
				className={`glyph glyph--${size} glyph--img`}
				decoding="async"
				onError={() => setBroken(true)}
				src={`/markets/${market.id}.jpg`}
			/>
		);
	return (
		<span aria-hidden="true" className={`glyph glyph--${size}`}>
			{market.rolling ? "↻" : topic(market).charAt(0)}
		</span>
	);
}
