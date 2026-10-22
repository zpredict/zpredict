// Plays every `video.js-motion` while it is in view, unless the visitor prefers reduced motion.
const reduce = matchMedia("(prefers-reduced-motion: reduce)");

const observer = new IntersectionObserver((entries) => {
	for (const entry of entries) {
		const video = entry.target as HTMLVideoElement;
		if (entry.isIntersecting && !reduce.matches) video.play().catch(() => {});
		else video.pause();
	}
});

for (const video of document.querySelectorAll<HTMLVideoElement>(
	"video.js-motion",
)) {
	observer.observe(video);
}
