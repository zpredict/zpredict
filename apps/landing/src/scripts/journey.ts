// Scroll choreography of the hero (ASCII Studio §10, without the walkthrough):
//   0 → 0.48 screens   heading fades out
//   0.55 → 1.55        the canvas frame shrinks into the showcase card (reveal), marquee fades
//   reveal 0.78 → 1    showcase copy fades and rises in
// The stage inside the frame keeps the hero's size and is cover-scaled, so the WebGL canvas
// never resizes while scrolling. Also keeps the artboard scale variables current.
import { updateSurfaces } from "./header-surface";

const root = document.documentElement;
const hero = document.querySelector<HTMLElement>(".js-hero");
const frame = document.querySelector<HTMLElement>(".js-frame");
const stage = document.querySelector<HTMLElement>(".js-stage");
const card = document.querySelector<HTMLElement>(".js-card");
const heading = document.querySelector<HTMLElement>(".js-hero-heading");
const layout = document.querySelector<HTMLElement>(".js-showcase");
const marquee = document.querySelector<HTMLElement>(".js-marquee");

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

let heroW = 1;
let heroH = 1;
let cardBox = { x: 0, y: 0, w: 1, h: 1 };

function measure() {
	if (!hero || !card) return;
	const s = Math.min(innerWidth / 1600, innerHeight / 1000);
	root.style.setProperty("--composition-scale", String(s));
	root.style.setProperty("--content-scale", String(s));
	heroW = hero.clientWidth;
	heroH = hero.clientHeight;
	// The stage (and its canvas) keeps the hero's size however small the frame gets.
	if (stage) {
		stage.style.width = `${heroW}px`;
		stage.style.height = `${heroH}px`;
	}
	const frameSize = stage ? Number(getComputedStyle(stage).getPropertyValue("--frame-size")) : 0.8;
	root.style.setProperty("--snap-scale", String((frameSize * Math.min(heroW, heroH)) / 741.6));
	// The card's untransformed box relative to the hero (its layout is static).
	const h = hero.getBoundingClientRect();
	const c = card.getBoundingClientRect();
	cardBox = { x: c.left - h.left, y: c.top - h.top, w: c.width, h: c.height };
}

function update() {
	if (!frame || !stage) return;
	const screens = scrollY / heroH;
	const reveal = ease(clamp((screens - 0.55) / 1));
	const copy = ease(clamp((reveal - 0.78) / 0.22));

	const w = mix(heroW, cardBox.w, reveal);
	const h = mix(heroH, cardBox.h, reveal);
	frame.style.width = `${w}px`;
	frame.style.height = `${h}px`;
	frame.style.transform = `translate3d(${mix(0, cardBox.x, reveal)}px, ${mix(0, cardBox.y, reveal)}px, 0)`;
	const s = Math.max(w / heroW, h / heroH);
	stage.style.transform = `translate3d(${(w - heroW * s) / 2}px, ${(h - heroH * s) / 2}px, 0) scale(${s})`;

	if (heading) heading.style.opacity = String(clamp(1 - screens / 0.48));
	root.style.setProperty("--copy", String(copy));
	layout?.setAttribute("aria-hidden", String(copy < 0.5));
	if (marquee) {
		const o = clamp(1 - reveal * 2);
		marquee.style.opacity = String(o);
		marquee.style.visibility = o ? "" : "hidden";
	}
	updateSurfaces();
}

let queued = false;
const schedule = () => {
	if (queued) return;
	queued = true;
	requestAnimationFrame(() => {
		queued = false;
		update();
	});
};

measure();
update();
addEventListener("scroll", schedule, { passive: true });
addEventListener("resize", () => {
	measure();
	update();
});
