// Text scramble from the ASCII Studio template: random glyphs that resolve into the real text.
// It writes `el.textContent` directly, so React must never update a scrambled element in place:
// key every scrambled element by its text (a new text mounts a new element).

const POOL = "!<>-_/?%+=@#$0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const TICK_MS = 40;
const ONCE_MS = 550;
const ONCE_DONE_MS = 650;
const SETTLE_MS = 700;

const glyph = () => POOL[Math.floor(Math.random() * POOL.length)];

/** `text` with every non-space character from index `from` on replaced by a random glyph. */
export function noise(text: string, from = 0): string {
	let out = text.slice(0, from);
	for (const ch of text.slice(from)) out += ch === " " ? " " : glyph();
	return out;
}

export const motionOk = () => !matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Drives one element's text: `hold` + `settle` for headings, `once` for CTAs and arrivals. */
export function scrambler(el: HTMLElement, text: string) {
	let timer = 0;
	let shown = text;
	const paint = (s: string) => {
		shown = s;
		el.textContent = s;
	};
	const run = (step: (ms: number) => boolean, delay = 0) => {
		clearInterval(timer);
		const t0 = performance.now() + delay;
		timer = window.setInterval(() => {
			const ms = performance.now() - t0;
			if (ms >= 0 && step(ms)) clearInterval(timer);
		}, TICK_MS);
	};
	return {
		/** Continuous: re-randomise every tick until `settle`. */
		hold() {
			if (!motionOk()) return;
			run(() => {
				paint(noise(text));
				return false;
			});
		},
		/** Lock characters in left to right (ease-out); the rest freeze on their last glyph. */
		settle(delay = 0) {
			const frozen = shown;
			if (frozen === text) {
				clearInterval(timer);
				return;
			}
			run((ms) => {
				const t = Math.min(1, ms / SETTLE_MS);
				const n = Math.round(text.length * (1 - (1 - t) ** 2));
				paint(text.slice(0, n) + frozen.slice(n));
				return t === 1;
			}, delay);
		},
		/** One pass: everything random, resolving left to right. */
		once() {
			if (!motionOk()) return;
			run((ms) => {
				const n = Math.floor(text.length * Math.min(1, ms / ONCE_MS));
				paint(ms >= ONCE_DONE_MS ? text : noise(text, n));
				return ms >= ONCE_DONE_MS;
			});
		},
		/** Stop now and show the real text. */
		cancel() {
			clearInterval(timer);
			if (shown !== text) paint(text);
		},
	};
}
