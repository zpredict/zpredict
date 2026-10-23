// Top-sheet menu. showModal() makes the page inert and keeps Tab inside the dialog. Escape and
// backdrop clicks close it with the slide-up animation; focus goes back to the Menu button;
// page scroll is locked while open. Nav links close the menu first, then scroll.
const dialog = document.querySelector<HTMLDialogElement>(".js-menu");
const menuButton = document.querySelector<HTMLButtonElement>(".js-menu-open");
const reduce = matchMedia("(prefers-reduced-motion: reduce)");
const ANIMATION = 750;
let timer = 0;

function open() {
	if (!dialog || dialog.open) return;
	clearTimeout(timer);
	dialog.showModal();
	document.documentElement.style.overflow = "hidden";
	menuButton?.setAttribute("aria-expanded", "true");
	// Two frames: the closed state must paint once for the transition to run.
	requestAnimationFrame(() => requestAnimationFrame(() => dialog.classList.add("is-open")));
}

function close(then?: () => void) {
	if (!dialog?.open) return;
	dialog.classList.remove("is-open");
	const done = () => {
		dialog.close();
		document.documentElement.style.overflow = "";
		menuButton?.setAttribute("aria-expanded", "false");
		menuButton?.focus();
		then?.();
	};
	if (reduce.matches) done();
	else timer = window.setTimeout(done, ANIMATION);
}

if (dialog && menuButton) {
	menuButton.addEventListener("click", open);
	dialog.querySelector(".js-menu-close")?.addEventListener("click", () => close());
	dialog.addEventListener("cancel", (e) => {
		e.preventDefault();
		close();
	});
	// The dialog fills the viewport; a click on it (not on the sheet) is a backdrop click.
	dialog.addEventListener("click", (e) => {
		if (e.target === dialog) close();
	});
	for (const link of dialog.querySelectorAll<HTMLAnchorElement>(".js-menu-link")) {
		// Other pages (the docs) navigate normally; in-page anchors close the menu first.
		if (link.origin !== location.origin || !link.hash) continue;
		link.addEventListener("click", (e) => {
			e.preventDefault();
			const target = document.querySelector(link.hash);
			close(() =>
				target?.scrollIntoView({ behavior: reduce.matches ? "auto" : "smooth", block: "start" }),
			);
		});
	}
}

export {};
