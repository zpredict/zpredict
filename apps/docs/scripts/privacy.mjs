// Privacy gate: what the browser downloads (.next/static: JS, CSS, fonts' CSS) must not
// reference any third-party host but Google Analytics 4's (third-party.mjs, #226). Pages render per request (CSP nonce), so their HTML is
// checked by the smoke test (test/smoke.test.mjs). Run after `next build` (the `build`
// script does).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { foreignUrls } from "./third-party.mjs";

const STATIC = new URL("../.next/static/", import.meta.url).pathname;

// Inert strings that are never fetched: doc links inside React/Next error messages,
// XML namespaces in inline SVG, and the core-js license banner in Next's polyfills.
export const INERT = [
	/^http:\/\/www\.w3\.org\//,
	/^https:\/\/github\.com\/zloirock\/core-js/,
	/^https:\/\/nextjs\.org\/docs\//,
	/^https:\/\/react\.dev\/errors\//,
	// Error-message doc links in the search engine and the MDX runtime.
	/^https:\/\/docs\.zbsearch\.com\/docs\//,
	/^https:\/\/github\.com\/syntax-tree\//,
	// The header's plain link to our repository: navigation, never fetched.
	/^https:\/\/github\.com\/zpredict\/zpredict$/,
];

const bad = [];
(function walk(dir) {
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, e.name);
		if (e.isDirectory()) walk(p);
		else if (/\.(js|css|json|txt)$/.test(e.name))
			for (const url of foreignUrls(readFileSync(p, "utf8"), INERT))
				bad.push(`${p.slice(STATIC.length)}: ${url}`);
	}
})(STATIC);

if (bad.length) {
	console.error(`privacy: ${bad.length} third-party URL(s) in .next/static\n${bad.join("\n")}`);
	process.exit(1);
}
console.log("privacy: no third-party URLs in .next/static (GA4 allowed)");
