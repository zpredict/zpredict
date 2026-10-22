// Disclosure menu for the top bar below 1200px (Nav.astro).
// Opens on the toggle; closes on Escape (focus returns to the toggle), link click,
// click outside, or widening past the breakpoint. The page does not scroll while open.
const toggle = document.querySelector<HTMLButtonElement>(".js-menu-toggle");
const menu = document.querySelector<HTMLElement>(".js-menu");
const compact = matchMedia("(max-width: 1199.98px)");

const isOpen = () => toggle?.getAttribute("aria-expanded") === "true";

function setOpen(open: boolean) {
	if (!toggle || !menu) return;
	toggle.setAttribute("aria-expanded", String(open));
	menu.classList.toggle("is-open", open);
	document.documentElement.style.overflow = open ? "hidden" : "";
	if (open) {
		// Wait a frame so the menu is visible (and therefore focusable).
		requestAnimationFrame(() => menu.querySelector<HTMLElement>("a")?.focus());
	}
}

if (toggle && menu) {
	toggle.addEventListener("click", () => setOpen(!isOpen()));

	menu.addEventListener("click", (event) => {
		if ((event.target as Element).closest("a")) setOpen(false);
	});

	document.addEventListener("keydown", (event) => {
		if (event.key !== "Escape" || !isOpen()) return;
		setOpen(false);
		toggle.focus();
	});

	document.addEventListener("click", (event) => {
		const target = event.target as Node;
		if (isOpen() && !menu.contains(target) && !toggle.contains(target)) setOpen(false);
	});

	compact.addEventListener("change", () => {
		if (!compact.matches && isOpen()) setOpen(false);
	});
}
