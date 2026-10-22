import { asciiSnapshot } from "@zpredict/ascii";
import AsciiLive from "./AsciiLive";

/**
 * Glyph grids for the static snapshot: ~8 CSS px cells on desktop and ~7.5 px on a 390 px phone.
 * Rows = cols / 1.5, because a cell is 1.5x as tall as it is wide. Kept in sync with home.css.
 */
export const GRID = { desktop: { cols: 80, rows: 53 }, phone: { cols: 48, rows: 32 } } as const;

/**
 * Hero visual: the extruded zPredict mark as ASCII. The snapshot is computed at build time, so it
 * is in the HTML (the LCP element and the no-WebGL / reduced-motion view); the live
 * `@zpredict/ascii` canvas fades in over it after load.
 */
export default function AsciiHero() {
	return (
		<div aria-hidden="true" className="ascii-hero">
			<pre className="ascii-hero__art ascii-hero__art--desktop">{asciiSnapshot(GRID.desktop)}</pre>
			<pre className="ascii-hero__art ascii-hero__art--phone">{asciiSnapshot(GRID.phone)}</pre>
			<AsciiLive />
		</div>
	);
}
