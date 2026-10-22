// "How it works": while pinned, the active step is floor(progress × 4) through the 400svh
// section; clicking a step scrolls to its slot. Unpinned (phones, reduced motion), a click just
// selects the step and brings the terminal panel into view.
const section = document.querySelector<HTMLElement>(".js-how");
const buttons = [...document.querySelectorAll<HTMLButtonElement>(".js-step")];
const screens = [...document.querySelectorAll<HTMLElement>(".js-screen")];
const pinned = matchMedia("(min-width: 901px) and (prefers-reduced-motion: no-preference)");
let active = 0;

function select(i: number) {
	if (i === active) return;
	active = i;
	buttons.forEach((b, j) => {
		b.setAttribute("aria-current", j === i ? "step" : "false");
	});
	screens.forEach((s, j) => {
		s.classList.toggle("is-active", j === i);
	});
}

function travel() {
	if (!section) return { top: 0, span: 1 };
	return {
		top: section.getBoundingClientRect().top + scrollY,
		span: section.offsetHeight - innerHeight,
	};
}

function onScroll() {
	if (!pinned.matches) return;
	const { top, span } = travel();
	const p = Math.min(1, Math.max(0, (scrollY - top) / span));
	select(Math.min(buttons.length - 1, Math.floor(p * buttons.length)));
}

buttons.forEach((button, i) => {
	button.addEventListener("click", () => {
		if (pinned.matches) {
			const { top, span } = travel();
			scrollTo({ top: top + span * ((i + 0.2) / buttons.length), behavior: "smooth" });
		} else {
			select(i);
			screens[i]?.parentElement?.scrollIntoView({ block: "nearest" });
		}
	});
});

let queued = false;
addEventListener(
	"scroll",
	() => {
		if (queued) return;
		queued = true;
		requestAnimationFrame(() => {
			queued = false;
			onScroll();
		});
	},
	{ passive: true },
);

export {};
