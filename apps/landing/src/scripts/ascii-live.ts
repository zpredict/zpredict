// Starts the live ASCII canvas once the page has loaded and the main thread is idle, so it never
// competes with first paint. Three.js arrives as its own lazy chunk. With reduced motion, or if
// WebGL is missing or fails, the build-time snapshot simply stays.
const hero = document.querySelector<HTMLElement>(".js-hero");
const canvas = document.querySelector<HTMLCanvasElement>(".js-ascii");
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Same square as the snapshot: --frame-size / --frame-y in components/hero/ModelFrame.astro. */
function framing(el: HTMLElement) {
	const css = getComputedStyle(el);
	return {
		size: Number(css.getPropertyValue("--frame-size")),
		x: 0.5,
		y: Number(css.getPropertyValue("--frame-y")),
	};
}

async function start() {
	if (!hero || !canvas) return;
	try {
		const { createAsciiScene } = await import("@zpredict/ascii");
		// Phones: ~7.5 px glyphs (the template's rule gives ~3 px, which reads as texture).
		const scene = createAsciiScene(canvas, { framing: framing(canvas), mobileCellPx: 7.5 });
		await scene.ready;
		hero.dataset.ready = "true";
		// Crossing the 900 px breakpoint moves the mark; follow it.
		matchMedia("(max-width: 900px)").addEventListener("change", () =>
			scene.setFraming(framing(canvas)),
		);
	} catch (error) {
		console.warn("ASCII canvas unavailable; keeping the static snapshot.", error);
	}
}

function whenIdle() {
	if ("requestIdleCallback" in window) requestIdleCallback(() => start(), { timeout: 3000 });
	else setTimeout(start, 300);
}

if (!reduce) {
	if (document.readyState === "complete") whenIdle();
	else addEventListener("load", whenIdle, { once: true });
}

export {};
