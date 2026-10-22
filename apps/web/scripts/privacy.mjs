// Privacy gate: the static export must make zero third-party requests.
// Scans every text file in out/ for absolute URLs and fails on any real host
// that is not ours. Run after `next build` (the `build` script does).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const OUT = new URL("../out/", import.meta.url).pathname;

// Hosts the app may reference: our relayers and dev mocks.
const OURS = /^(([a-z0-9-]+\.)*zpredict\.site|localhost)$/;
// Inert strings that are never fetched: XML namespaces, the core-js license banner in
// Next's polyfills, doc links inside React/Next error messages, and a paper citation in a
// GLSL comment of Three.js (lazy hero chunk from @zpredict/ascii).
const INERT = [
	/^https:\/\/jcgt\.org\/published\//,
	/^http:\/\/www\.w3\.org\//,
	/^https:\/\/github\.com\/zloirock\/core-js/,
	/^https:\/\/nextjs\.org\/docs\//,
	/^https:\/\/react\.dev\/errors\//,
];

const bad = [];
function scan(file) {
	const text = readFileSync(file, "utf8");
	for (const [url] of text.matchAll(/https?:\/\/[^\s"'`)<>\\,]+/g)) {
		let host;
		try {
			host = new URL(url).hostname;
		} catch {
			continue;
		}
		// Hosts without a dot ("https://a", "http://n") are URL-parser feature tests in
		// polyfills, not resolvable third-party hosts.
		if (!host.includes(".") && host !== "localhost") continue;
		if (OURS.test(host) || INERT.some((r) => r.test(url))) continue;
		bad.push(`${file.slice(OUT.length)}: ${url}`);
	}
}

function walk(dir) {
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, e.name);
		if (e.isDirectory()) walk(p);
		else if (/\.(html|js|css|txt|json|webmanifest)$/.test(e.name)) scan(p);
	}
}

walk(OUT);
if (bad.length) {
	console.error(`privacy: ${bad.length} third-party URL(s) in out/\n${bad.join("\n")}`);
	process.exit(1);
}
console.log("privacy: no third-party URLs in out/");
