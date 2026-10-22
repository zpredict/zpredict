// Preloader counter (ASCII Studio §4, shortened): targets only rise — 60 once the bundle runs,
// 90 when fonts are ready, 100 after the load event. The shown value eases toward the target
// (1 − e^(−dt/180ms)); at least 900 ms on screen; then 180 ms pause, 550 ms fade, and the page
// is released. Base.astro's inline timeout releases it anyway after 4 s.
const root = document.documentElement;
const el = document.querySelector<HTMLElement>(".js-preloader");
const num = document.querySelector<HTMLElement>(".js-preloader-num");
const MIN_MS = 900;

if (el && num && root.classList.contains("is-loading")) {
	const born = performance.now();
	let target = 60;
	let shown = 0;
	let last = born;
	const raise = (v: number) => {
		target = Math.max(target, v);
	};
	document.fonts.ready.then(() => raise(90));
	if (document.readyState === "complete") raise(100);
	else addEventListener("load", () => raise(100), { once: true });

	const release = () => {
		el.dataset.state = "leaving";
		setTimeout(() => root.classList.remove("is-loading"), 550);
	};

	const frame = (now: number) => {
		const dt = now - last;
		last = now;
		const goal = now - born < MIN_MS ? Math.min(target, 97) : target;
		shown += (goal - shown) * (1 - Math.exp(-dt / 180));
		if (goal === 100 && 100 - shown < 0.5) shown = 100;
		const value = Math.floor(shown);
		num.textContent = String(value);
		el.setAttribute("aria-valuenow", String(value));
		el.style.setProperty("--load-progress", String(shown / 100));
		if (value === 100) setTimeout(release, 180);
		else if (root.classList.contains("is-loading")) requestAnimationFrame(frame);
	};
	requestAnimationFrame(frame);
}

export {};
