// Privacy gate: the static export must make zero third-party requests.
// Scans every text file in out/ (or the directory given, e.g. the landing's dist/) for
// absolute URLs and fails on any real host that is not ours. Run after `next build` (the
// `build` script does; the landing's build runs it on its dist/).
// One exception, route-scoped: Cloudflare Turnstile on /faucet (#133). Its origin may
// appear only in files that belong to the faucet route alone: out/faucet/* and the build
// assets out/faucet/index.{html,txt} reference and no other page does.
// --analytics (the landing build only, #226) also allows Google Analytics 4's hosts. The app
// build never passes it: app.zpredict.site contacts no third party.
// Usage: node privacy.mjs [--analytics] [out dir]
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const argv = process.argv.slice(2);
const ANALYTICS = argv.includes("--analytics");
const dirArg = argv.find((a) => a !== "--analytics");
const OUT = dirArg ? `${resolve(dirArg)}/` : new URL("../out/", import.meta.url).pathname;
const FAUCET_ONLY = "challenges.cloudflare.com";
// GA4's loader and beacon hosts, allowed only with --analytics.
const GA =
	/^(www\.googletagmanager\.com|([a-z0-9-]+\.)*google-analytics\.com|([a-z0-9-]+\.)*analytics\.google\.com)$/;

// Hosts the app may reference: our relayers and dev mocks, plus the relayers' onion
// services this build was given (NEXT_PUBLIC_RELAYERS_ONION, #90). No other .onion host.
const OURS = /^(([a-z0-9-]+\.)*zpredict\.site|localhost)$/;
const ONIONS = new Set(
	(process.env.NEXT_PUBLIC_RELAYERS_ONION ?? "")
		.split(",")
		.map((u) => u.trim())
		.filter(Boolean)
		.map((u) => new URL(u).hostname)
		.filter((h) => h.endsWith(".onion")),
);
// Inert strings that are never fetched: XML namespaces, the core-js license banner in
// Next's polyfills, doc links inside React/Next error messages, a paper citation in a
// GLSL comment of Three.js (lazy hero chunk from @zpredict/ascii), plain links to our repo,
// and a plain link on /faucet to an external faucet (fetched only if the user clicks it).
const INERT = [
	/^https:\/\/jcgt\.org\/published\//,
	/^http:\/\/www\.w3\.org\//,
	/^https:\/\/github\.com\/zloirock\/core-js/,
	/^https:\/\/nextjs\.org\/docs\//,
	/^https:\/\/react\.dev\/errors\//,
	/^https:\/\/zecfaucet\.com\/$/,
	/^https:\/\/github\.com\/zpredict\//,
];

const files = [];
(function walk(dir) {
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, e.name);
		if (e.isDirectory()) walk(p);
		else if (/\.(html|js|css|txt|json|webmanifest)$/.test(e.name)) files.push(p);
	}
})(OUT);

// Build assets a page (its html or RSC payload) references.
const refs = (f) =>
	Array.from(
		readFileSync(f, "utf8").matchAll(/\/(_next\/static\/[^"'\\\s)]+)/g),
		(m) => OUT + m[1],
	);
const pages = files.filter((f) => /\.(html|txt)$/.test(f));
const isFaucet = (f) => f.startsWith(`${OUT}faucet/`);
const elsewhere = new Set(pages.filter((f) => !isFaucet(f)).flatMap(refs));
const faucetOnly = new Set(
	pages
		.filter(isFaucet)
		.flatMap(refs)
		.filter((r) => !elsewhere.has(r)),
);

const bad = [];
for (const file of files) {
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
		if (OURS.test(host) || ONIONS.has(host) || INERT.some((r) => r.test(url))) continue;
		if (ANALYTICS && GA.test(host)) continue;
		if (host === FAUCET_ONLY && (isFaucet(file) || faucetOnly.has(file))) continue;
		bad.push(`${file.slice(OUT.length)}: ${url}`);
	}
}

if (bad.length) {
	console.error(`privacy: ${bad.length} third-party URL(s) in ${OUT}\n${bad.join("\n")}`);
	process.exit(1);
}
console.log(`privacy: no third-party URLs in ${OUT}${ANALYTICS ? " (GA4 allowed)" : ""}`);
