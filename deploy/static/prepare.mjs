// Build step for the static images (apps/landing, apps/web).
// 1. Writes csp.caddy: a self-only CSP that allows the build's inline scripts and styles
//    by sha256 hash (Next and Astro both inline a few), never 'unsafe-inline'.
// 2. Precompresses text assets to .br and .gz so Caddy serves them without CPU per request.
// Usage: node prepare.mjs <site dir> <csp.caddy out> [connect-src origins, comma separated]
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const [dir, out, connect = ""] = process.argv.slice(2);
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

const origins = connect.split(",").filter(Boolean);
for (const o of origins) if (new URL(o).origin !== o) throw new Error(`not an origin: ${o}`);

const csp = [
	"default-src 'none'",
	`script-src 'self' ${[...scripts].join(" ")}`,
	`style-src 'self' ${[...styles, ...attrs].join(" ")}${attrs.size ? " 'unsafe-hashes'" : ""}`,
	"img-src 'self'",
	"font-src 'self'",
	"media-src 'self'",
	"manifest-src 'self'",
	`connect-src 'self' ${origins.join(" ")}`,
	"base-uri 'none'",
	"form-action 'none'",
	"frame-ancestors 'none'",
]
	.map((d) => d.trim())
	.join("; ");
writeFileSync(out, `header Content-Security-Policy "${csp}"\n`);

for (const f of files.filter((f) => /\.(html|js|css|txt|json|svg|webmanifest|xml)$/.test(f))) {
	const buf = readFileSync(f);
	if (buf.length < 1024) continue;
	writeFileSync(
		`${f}.br`,
		brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }),
	);
	writeFileSync(`${f}.gz`, gzipSync(buf, { level: 9 }));
}
