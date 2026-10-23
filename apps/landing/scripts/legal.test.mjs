// Smoke test for the Privacy Policy and Terms pages (#123), on the built sites: run after
// `pnpm build` (CI does). Checks the pages render their content, every footer links them, the
// app's footer points at pages that exist, and the pages reference no third-party hosts.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { NOTE, privacy, terms } from "../src/data/legal.ts";

const DIST = new URL("../dist/", import.meta.url);
const WEB_OUT = new URL("../../web/out/", import.meta.url);
const read = (base, path) => readFileSync(new URL(path, base), "utf8");
/** Astro escapes text; compare against the escaped form of quotes and ampersands. */
const html = (s) => s.replaceAll("&", "&amp;").replaceAll("'", "&#39;").replaceAll('"', "&quot;");
const text = (seg) => (typeof seg === "string" ? seg : seg.text);

for (const [path, doc] of [
	["privacy/index.html", privacy],
	["terms/index.html", terms],
]) {
	test(`${path} renders its title, note, date and every section`, () => {
		const page = read(DIST, path);
		for (const s of [
			doc.title,
			NOTE,
			doc.updated,
			doc.summary,
			...doc.sections.map((x) => x.heading),
		])
			assert.ok(page.includes(html(s)), `missing: ${s}`);
		for (const p of doc.sections.flatMap((x) => x.paragraphs))
			for (const seg of p) assert.ok(page.includes(html(text(seg))), `missing: ${text(seg)}`);
	});

	test(`${path} references only our origins and the repository`, () => {
		const page = read(DIST, path);
		for (const [url] of page.matchAll(/https?:\/\/[^\s"'<>)]+/g)) {
			const { hostname, pathname } = new URL(url);
			const ok =
				/(^|\.)zpredict\.site$/.test(hostname) ||
				(hostname === "github.com" && pathname.startsWith("/zpredict/zpredict"));
			assert.ok(ok, `third-party URL: ${url}`);
		}
	});
}

test("the landing footer links both pages (home and the legal pages)", () => {
	for (const path of ["index.html", "privacy/index.html", "terms/index.html"]) {
		const page = read(DIST, path);
		assert.ok(page.includes('href="/privacy/"'), `${path}: no /privacy/ link`);
		assert.ok(page.includes('href="/terms/"'), `${path}: no /terms/ link`);
	}
});

test("the app footer links the landing's pages, which exist", (t) => {
	if (!existsSync(new URL("index.html", WEB_OUT))) return t.skip("apps/web not built");
	const page = read(WEB_OUT, "index.html");
	for (const p of ["privacy", "terms"]) {
		assert.match(page, new RegExp(`href="https://zpredict\\.site/${p}/"`), `app: no ${p} link`);
		assert.ok(existsSync(new URL(`${p}/index.html`, DIST)), `landing has no /${p}/`);
	}
});
