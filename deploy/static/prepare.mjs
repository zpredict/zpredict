// Build step for the static images (apps/landing, apps/web).
// 1. Writes csp.caddy (imported at site level in the Caddyfile): a self-only CSP that allows the build's inline scripts
//    and styles by sha256 hash (Next and Astro both inline a few), never 'unsafe-inline'. With faucet origins, /faucet/
//    alone gets a second CSP that also allows them for script-src, frame-src and connect-src (Turnstile, #133).
//    --analytics (the landing image only, #226) adds Google Analytics 4's origins; the app never passes it.
// 2. Precompresses text assets to .br and .gz so Caddy serves them without CPU per request.
// Usage: node prepare.mjs [--analytics] <site dir> <csp.caddy out> [connect-src origins] [/faucet/-only origins],
//        origins comma separated
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const argv = process.argv.slice(2);
const analytics = argv.includes("--analytics");
const [dir, out, connect = "", faucetOnly = ""] = argv.filter((a) => a !== "--analytics");
if (!dir || !out) throw new Error("usage: prepare.mjs <site dir> <csp.caddy out> [origins]");

const files = [];
(function walk(d) {
	for (const e of readdirSync(d, { withFileTypes: true })) {
		const p = join(d, e.name);
		if (e.isDirectory()) walk(p);
		else files.push(p);
	}
})(dir);

const hash = (s) => `'sha256-${createHash("sha256").update(s).digest("base64")}'`;
// Attribute values are hashed after the parser decodes entities.
const decode = (s) =>
	s
		.replaceAll("&quot;", '"')
		.replaceAll("&#39;", "'")
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&amp;", "&");

const scripts = new Set();
const styles = new Set();
const attrs = new Set();
for (const f of files.filter((f) => f.endsWith(".html"))) {
	const html = readFileSync(f, "utf8");
	for (const [, body] of html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g))
		if (body) scripts.add(hash(body));
	for (const [, body] of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) styles.add(hash(body));
	for (const [, v] of html.matchAll(/\sstyle="([^"]*)"/g)) attrs.add(hash(decode(v)));
}

const list = (s) => {
	const os = s.split(",").filter(Boolean);
	for (const o of os) if (new URL(o).origin !== o) throw new Error(`not an origin: ${o}`);
	return os;
};
const origins = list(connect);
const extra = list(faucetOnly);
// What gtag.js needs (Google's GA4 CSP guide): the loader, and the beacons it sends.
const GA = analytics
	? {
			script: ["https://www.googletagmanager.com"],
			img: ["https://www.google-analytics.com", "https://www.googletagmanager.com"],
			connect: [
				"https://www.google-analytics.com",
				"https://*.google-analytics.com",
				"https://*.analytics.google.com",
				"https://www.googletagmanager.com",
			],
		}
	: { script: [], img: [], connect: [] };

const policy = (more) =>
	[
		"default-src 'none'",
		`script-src 'self' ${[...scripts, ...GA.script, ...more].join(" ")}`,
		`style-src 'self' ${[...styles, ...attrs].join(" ")}${attrs.size ? " 'unsafe-hashes'" : ""}`,
		`img-src 'self' ${GA.img.join(" ")}`,
		"font-src 'self'",
		"media-src 'self'",
		"manifest-src 'self'",
		`connect-src 'self' ${[...origins, ...GA.connect, ...more].join(" ")}`,
		more.length ? `frame-src ${more.join(" ")}` : "",
		"base-uri 'none'",
		"form-action 'none'",
		"frame-ancestors 'none'",
	]
		.map((d) => d.trim())
		.filter(Boolean)
		.join("; ");
const header = (matcher, more) => `header ${matcher}Content-Security-Policy "${policy(more)}"\n`;
writeFileSync(
	out,
	extra.length
		? `@csp_faucet path /faucet /faucet/*\n${header("@csp_faucet ", extra)}` +
				`@csp_rest not path /faucet /faucet/*\n${header("@csp_rest ", [])}`
		: header("", []),
);

for (const f of files.filter((f) => /\.(html|js|css|txt|json|svg|webmanifest|xml)$/.test(f))) {
	const buf = readFileSync(f);
	if (buf.length < 1024) continue;
	writeFileSync(
		`${f}.br`,
		brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }),
	);
	writeFileSync(`${f}.gz`, gzipSync(buf, { level: 9 }));
}
