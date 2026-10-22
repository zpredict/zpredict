"use client";
import type { AsciiScene } from "@zpredict/ascii";
import { useEffect, useRef, useState } from "react";
import { motionOk } from "@/lib/scramble";

/** Target glyph cell in CSS px, matching the snapshot's cells (AsciiHero GRID). */
const CELL_CSS = { desktop: 7.9, phone: 7.5 };

/**
 * CSS px of one design px of cell width, as @zpredict/ascii sizes a canvas: a 1600 x 1000
 * artboard, or 900 across (with cells shrunk by 450 / w) when the canvas is ≤ 900 px wide.
 */
const cellScale = (w: number, h: number) =>
	w <= 900 ? (w / 900) * Math.min(1, 450 / w) : Math.min(w / 1600, h / 1000);

/** Loads Three.js (its own chunk) and starts the scene. Throws without WebGL. */
async function mount(el: HTMLCanvasElement): Promise<AsciiScene> {
	const { createAsciiScene } = await import("@zpredict/ascii");
	const css = matchMedia("(max-width: 900px)").matches ? CELL_CSS.phone : CELL_CSS.desktop;
	return createAsciiScene(el, {
		framing: { size: 1, x: 0.5, y: 0.5 },
		cell: css / cellScale(el.clientWidth, el.clientHeight),
	});
}

/**
 * The live ASCII canvas over the snapshot. Started after `load` plus an idle callback, so
 * Three.js stays off the critical path; never with reduced motion; on failure the snapshot stays.
 */
export default function AsciiLive() {
	const canvas = useRef<HTMLCanvasElement>(null);
	const [live, setLive] = useState(false);

	useEffect(() => {
		if (!motionOk()) return;
		let gone = false;
		let scene: AsciiScene | undefined;
		const start = () => {
			const el = canvas.current;
			if (gone || !el) return;
			mount(el)
				.then(async (s) => {
					scene = s;
					if (gone) return s.dispose();
					await s.ready;
					if (!gone) setLive(true);
				})
				.catch(() => {
					// No WebGL or shaders failed: the snapshot is already the hero.
				});
		};
		const idle = () =>
			"requestIdleCallback" in window ? requestIdleCallback(start) : setTimeout(start, 200);
		if (document.readyState === "complete") idle();
		else addEventListener("load", idle, { once: true });
		return () => {
			gone = true;
			removeEventListener("load", idle);
			scene?.dispose();
		};
	}, []);

	return <canvas className={`ascii-hero__live${live ? " is-live" : ""}`} ref={canvas} />;
}
