// Header items turn dark-on-light over light surfaces. For each item, look at what is behind its
// centre: the nearest `[data-surface]` ancestor decides. In the hero that is the shrinking model
// frame (dark) or, around it, the lime showcase (light), so no special case is needed.
const items = [...document.querySelectorAll<HTMLElement>(".js-surface")];
const header = document.querySelector(".header");

function isLight(x: number, y: number): boolean {
	for (const el of document.elementsFromPoint(x, y)) {
		if (header?.contains(el)) continue;
		const surface = el.closest("[data-surface]");
		if (surface) return surface.getAttribute("data-surface") === "light";
	}
	return false;
}

export function updateSurfaces() {
	for (const el of items) {
		const r = el.getBoundingClientRect();
		if (!r.width) continue;
		el.classList.toggle("is-on-light", isLight(r.left + r.width / 2, r.top + r.height / 2));
	}
}

let queued = false;
const schedule = () => {
	if (queued) return;
	queued = true;
	requestAnimationFrame(() => {
		queued = false;
		updateSurfaces();
	});
};
addEventListener("scroll", schedule, { passive: true });
addEventListener("resize", schedule);
schedule();
