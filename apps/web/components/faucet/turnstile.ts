// Cloudflare Turnstile, the faucet's only third party. Loaded on the /faucet route only,
// and only when the user asks for a drop: never on page load, never on any other route
// (scripts/privacy.mjs and the per-route CSP in deploy/static enforce both).

const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
	render(el: HTMLElement, options: Record<string, unknown>): string;
	remove(id: string): void;
}

declare global {
	interface Window {
		turnstile?: TurnstileApi;
	}
}

let loading: Promise<TurnstileApi> | null = null;

function load(): Promise<TurnstileApi> {
	loading ??= new Promise((resolve, reject) => {
		const s = document.createElement("script");
		s.src = SRC;
		s.async = true;
		s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("no API")));
		s.onerror = () => {
			loading = null;
			reject(new Error("Turnstile did not load"));
		};
		document.head.append(s);
	});
	return loading;
}

/** A Turnstile token issued for `challenge` (its `cdata`), from a widget rendered in `el`. */
export async function turnstileToken(
	el: HTMLElement,
	siteKey: string,
	challenge: string,
): Promise<string> {
	const api = await load();
	return new Promise((resolve, reject) => {
		const id = api.render(el, {
			sitekey: siteKey,
			cdata: challenge,
			action: "drip",
			theme: "dark",
			callback: (token: string) => {
				resolve(token);
				setTimeout(() => api.remove(id), 0);
			},
			"error-callback": () => reject(new Error("The Turnstile check failed; try again.")),
			"expired-callback": () => reject(new Error("The Turnstile check expired; try again.")),
		});
	});
}
