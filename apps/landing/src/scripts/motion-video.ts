// Plays every `video.js-motion` while it is in view, unless the visitor prefers reduced motion.
const reduce = matchMedia("(prefers-reduced-motion: reduce)");

const observer = new IntersectionObserver((entries) => {
	for (const entry of entries) {
		const video = entry.target as HTMLVideoElement;
		if (!entry.isIntersecting || reduce.matches) {
			video.pause();
			continue;
		}
		video.play().catch(() => {
			// The browser may refuse to play (e.g. data saver); the poster stays visible.
		});
	}
});

for (const video of document.querySelectorAll<HTMLVideoElement>("video.js-motion")) {
	observer.observe(video);
}
