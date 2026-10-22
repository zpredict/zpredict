// Plays every `video.js-motion` while it is in view, on wide screens only, unless the visitor
// prefers reduced motion. Videos start after the load event so the posters own first paint and
// LCP; phones keep the poster and skip the download.
const motion = matchMedia("(min-width: 800px) and (prefers-reduced-motion: no-preference)");

const observer = new IntersectionObserver((entries) => {
	for (const entry of entries) {
		const video = entry.target as HTMLVideoElement;
		if (!entry.isIntersecting || !motion.matches) {
			video.pause();
			continue;
		}
		if (!video.src) video.src = video.dataset.src ?? "";
		video.play().catch(() => {
			// The browser may refuse to play (e.g. data saver); the poster stays visible.
		});
	}
});

function start() {
	for (const video of document.querySelectorAll<HTMLVideoElement>("video.js-motion")) {
		observer.observe(video);
	}
}

if (document.readyState === "complete") start();
else addEventListener("load", start, { once: true });
