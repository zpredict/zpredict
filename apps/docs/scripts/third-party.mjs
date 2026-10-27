// Shared by the build gate (privacy.mjs) and the smoke test: find what would make the
// browser talk to anyone but us and Google Analytics.

/** Hosts the docs may load from: our own origins and local dev. */
export const OURS = /^(([a-z0-9-]+\.)*zpredict\.site|localhost|127\.0\.0\.1)$/;

/** The one third party allowed: Google Analytics 4's loader and beacon hosts (#226). */
export const ANALYTICS =
	/^(www\.googletagmanager\.com|([a-z0-9-]+\.)*google-analytics\.com|([a-z0-9-]+\.)*analytics\.google\.com)$/;
const allowed = (host) => OURS.test(host) || ANALYTICS.test(host);

/**
 * Absolute http(s) URLs in `text` whose host is neither ours nor GA's and that match none of `inert`
 * (strings that are never fetched, such as doc links inside error messages).
 */
export function foreignUrls(text, inert = []) {
	const bad = [];
	for (const [url] of text.matchAll(/https?:\/\/[^\s"'`)<>\\,]+/g)) {
		let host;
		try {
			host = new URL(url).hostname;
		} catch {
			continue;
		}
		// Dotless hosts ("https://a") are URL-parser feature tests in polyfills.
		if (!host.includes(".") && host !== "localhost") continue;
		if (allowed(host) || inert.some((r) => r.test(url))) continue;
		bad.push(url);
	}
	return bad;
}

/**
 * URLs an HTML page makes the browser fetch: `src`, `srcset`, `poster`, `<link href>` and
 * CSS `url()`. Plain `<a href>` links are navigation, not requests, so they are skipped.
 */
export function fetchedUrls(html) {
	const urls = [];
	for (const [, v] of html.matchAll(/\s(?:src|poster)="([^"]*)"/g)) urls.push(v);
	for (const [, v] of html.matchAll(/\ssrcset="([^"]*)"/g))
		for (const part of v.split(",")) urls.push(part.trim().split(/\s+/)[0]);
	for (const [, v] of html.matchAll(/<link\b[^>]*\shref="([^"]*)"/g)) urls.push(v);
	for (const [, v] of html.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) urls.push(v);
	return urls.filter(Boolean);
}

/** The subset of `urls` that leaves our origins and GA's (relative and data: URLs stay home). */
export function foreignFetches(urls) {
	return urls.filter((u) => {
		if (u.startsWith("data:") || u.startsWith("#")) return false;
		if (!/^([a-z]+:)?\/\//i.test(u)) return false;
		try {
			return !allowed(new URL(u, "https://docs.zpredict.site").hostname);
		} catch {
			return true;
		}
	});
}
