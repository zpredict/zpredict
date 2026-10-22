// Relayer View: each `.js-share` shows fresh random bytes, like a real XOR share.
const reduce = matchMedia("(prefers-reduced-motion: reduce)");
const shares = document.querySelectorAll<HTMLElement>(".js-share");

const hex = (bytes: number) =>
	Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) =>
		b.toString(16).padStart(2, "0"),
	).join("");

const paint = () => {
	for (const share of shares) {
		share.textContent = [hex(12), hex(12), hex(12), hex(12)].join("\n");
	}
};

paint();
setInterval(() => {
	if (!reduce.matches && !document.hidden) paint();
}, 1600);
