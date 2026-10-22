// Text scramble (ASCII Studio §15) on `[data-scramble]` roots; their `[data-scramble-line]`
// children are animated (aria-hidden; the root carries the real text as its accessible name).
//   once:        on enter, every character is random and resolves left to right over 550 ms.
//   continuous:  while hovered, all characters keep re-randomising; on leave they settle left
//                to right over 700 ms (ease-out), lines staggered by 80 ms.
// Mouse hover on (hover: hover) and (pointer: fine) devices and keyboard focus only: never on load
// or touch, so the text is readable at rest. Spaces are never replaced; off with reduced motion.
const POOL = "!<>-_/?%+=@#$0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const TICK = 40;
const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
const random = () => POOL[Math.floor(Math.random() * POOL.length)];

class Line {
	readonly text: string;
	shown: string[];
	constructor(readonly el: HTMLElement) {
		// Template indentation ends up in the text node; only the words matter.
		this.text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
		this.shown = [...this.text];
		el.textContent = this.text;
	}
	/** Characters before `revealed` show the real text; the rest are random or frozen. */
	paint(revealed: number, randomise: boolean) {
		this.shown = this.shown.map((c, i) => {
			const real = this.text[i];
			if (real === " " || i < revealed) return real;
			return randomise ? random() : c;
		});
		this.el.textContent = this.shown.join("");
	}
}

function bind(root: HTMLElement) {
	const lines = [...root.querySelectorAll<HTMLElement>("[data-scramble-line]")].map(
		(el) => new Line(el),
	);
	const once = root.dataset.scramble === "once";
	let timer = 0;
	let start = 0;
	let hovering = false;

	const run = (step: (elapsed: number) => boolean) => {
		clearInterval(timer);
		start = performance.now();
		const tick = () => {
			if (!step(performance.now() - start)) clearInterval(timer);
		};
		tick();
		timer = window.setInterval(tick, TICK);
	};

	const resolve = (duration: number, total: number, curve: (t: number) => number) =>
		run((elapsed) => {
			lines.forEach((line, i) => {
				const t = Math.min(1, Math.max(0, (elapsed - i * 80) / duration));
				line.paint(Math.floor(curve(t) * line.text.length), once && t < 1);
			});
			return elapsed < total + lines.length * 80;
		});

	const enter = () => {
		hovering = true;
		if (once) resolve(550, 650, (t) => t);
		else
			run(() => {
				for (const line of lines) line.paint(0, true);
				return hovering;
			});
	};
	const leave = () => {
		hovering = false;
		if (!once) resolve(700, 700, (t) => 1 - (1 - t) ** 2);
	};

	// Hover only with a real mouse on a hover-capable device: touch never scrambles.
	const mouse = (e: PointerEvent) => e.pointerType === "mouse" && finePointer.matches;
	root.addEventListener("pointerenter", (e) => {
		if (mouse(e)) enter();
	});
	root.addEventListener("pointerleave", (e) => {
		if (mouse(e) || hovering) leave();
	});
	root.addEventListener("focusin", enter);
	root.addEventListener("focusout", leave);
}

if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
	for (const root of document.querySelectorAll<HTMLElement>("[data-scramble]")) bind(root);
}

export {};
