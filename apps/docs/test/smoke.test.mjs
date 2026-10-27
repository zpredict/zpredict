// Integration and regression test against the built server (`pnpm build` first): key routes
// render with their content, every page has HTML and Markdown, search answers, and no page
// makes the browser fetch from a third party or loosens the CSP.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { ANALYTICS, fetchedUrls, foreignFetches } from "../scripts/third-party.mjs";

const root = new URL("../", import.meta.url).pathname;
const pages = JSON.parse(readFileSync(`${root}content/docs/meta.json`, "utf8")).pages.filter(
	(p) => !p.startsWith("---"),
);

let server;
let base;

const freePort = () =>
	new Promise((resolve) => {
		const s = createServer().listen(0, () => {
			const { port } = s.address();
			s.close(() => resolve(port));
		});
	});

before(async () => {
	assert.ok(existsSync(`${root}.next/BUILD_ID`), "run `pnpm build` before the smoke test");
	const port = await freePort();
	base = `http://127.0.0.1:${port}`;
	server = spawn(
		`${root}node_modules/.bin/next`,
		["start", "-p", String(port), "-H", "127.0.0.1"],
		{
			cwd: root,
			stdio: "ignore",
		},
	);
	for (let i = 0; i < 100; i++) {
		try {
			if ((await fetch(`${base}/robots.txt`)).ok) return;
		} catch {
			// not listening yet
		}
		await new Promise((r) => setTimeout(r, 200));
	}
	throw new Error("docs server did not start");
});

after(() => server?.kill());

const get = (path, init) => fetch(`${base}${path}`, { redirect: "manual", ...init });

/** The HTML page and its CSP, checked for third-party fetches and a nonce on every script. */
async function page(path) {
	const res = await get(path);
	assert.equal(res.status, 200, path);
	const html = await res.text();
	const csp = res.headers.get("content-security-policy") ?? "";
	assert.match(csp, /default-src 'none'/, `${path}: CSP`);
	assert.match(csp, /script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/, `${path}: nonce`);
	// The only remote origins: GA4's (#226), and only where gtag.js needs them.
	for (const o of csp.match(/https?:\/\/[^\s;]+/g) ?? [])
		assert.match(new URL(o.replace("*.", "x.")).hostname, ANALYTICS, `${path}: CSP origin ${o}`);
	assert.doesNotMatch(csp, /frame-src|unsafe-eval|unsafe-hashes/, `${path}: CSP`);
	assert.doesNotMatch(csp.replace(/https:\/\/\*\./g, ""), /\*/, `${path}: CSP wildcard`);
	const nonce = csp.match(/'nonce-([^']+)'/)[1];
	for (const [tag] of html.matchAll(/<script\b[^>]*>/g)) {
		if (/type="application\/(ld\+)?json"/.test(tag)) continue;
		assert.ok(tag.includes(`nonce="${nonce}"`), `${path}: script without nonce: ${tag}`);
	}
	assert.deepEqual(foreignFetches(fetchedUrls(html)), [], `${path}: third-party fetches`);
	assert.doesNotMatch(html, /plausible|cloudflareinsights/);
	return html;
}

test("/ and /docs land on the introduction", async () => {
	for (const path of ["/", "/docs"]) {
		const res = await get(path);
		assert.ok([301, 308].includes(res.status), path);
		assert.equal(new URL(res.headers.get("location"), base).pathname, "/docs/introduction");
	}
});

test("/docs/introduction renders the brand, the content and the security headers", async () => {
	const html = await page("/docs/introduction");
	assert.match(html, /<title>Introduction \| zPredict Docs<\/title>/);
	assert.match(html, /Price public, participants private/);
	assert.match(html, /\/white\/android-chrome-192x192\.png/);
	assert.match(html, /jetbrains_mono[^"]*\.woff2/i, "self-hosted font");
	assert.match(html, /googletagmanager\.com\/gtag\/js\?id=G-W949LN2MSJ/, "GA4 loader (#226)");
	const res = await get("/docs/introduction");
	assert.equal(res.headers.get("referrer-policy"), "no-referrer");
	assert.equal(res.headers.get("x-frame-options"), "DENY");
});

test("every page in meta.json renders as HTML and as Markdown", async () => {
	for (const slug of pages) {
		const html = await page(`/docs/${slug}`);
		const title = html.match(/<h1[^>]*>([^<]+)<\/h1>/)?.[1];
		assert.ok(title, `${slug}: h1`);
		const md = await get(`/docs/${slug}.md`);
		assert.equal(md.status, 200, `${slug}.md`);
		assert.match(md.headers.get("content-type"), /text\/markdown/);
		const text = await md.text();
		assert.ok(text.startsWith("# "), `${slug}.md starts with its title`);
		assert.ok(text.includes(`https://docs.zpredict.site/docs/${slug}`), `${slug}.md canonical`);
	}
});

test("an Accept: text/markdown request gets Markdown", async () => {
	const res = await get("/docs/privacy", { headers: { accept: "text/markdown" } });
	assert.equal(res.status, 200);
	assert.match(await res.text(), /^# Privacy/);
});

test("/llms.txt lists every page and /llms-full.txt holds them all", async () => {
	const index = await (await get("/llms.txt")).text();
	assert.match(index, /^# zPredict/);
	const full = await (await get("/llms-full.txt")).text();
	for (const slug of pages) {
		assert.ok(index.includes(`/docs/${slug}.md`), `llms.txt: ${slug}`);
		assert.ok(full.includes(`/docs/${slug})`), `llms-full.txt: ${slug}`);
	}
	assert.doesNotMatch(full, /helico/i, "no template leftovers");
});

test("search answers from this server", async () => {
	const res = await get("/api/search?query=frost");
	assert.equal(res.status, 200);
	const hits = await res.json();
	assert.ok(
		hits.some((h) => h.url.startsWith("/docs/settlement")),
		"FROST finds Settlement",
	);
});

test("social cards, sitemap and robots are served", async () => {
	const og = await get("/og/docs/introduction/image.webp");
	assert.equal(og.status, 200);
	assert.equal(og.headers.get("content-type"), "image/webp");
	const sitemap = await (await get("/sitemap.xml")).text();
	assert.match(sitemap, /https:\/\/docs\.zpredict\.site\/docs\/introduction/);
	assert.match(await (await get("/robots.txt")).text(), /Sitemap: https:\/\/docs\.zpredict\.site/);
});

test("an unknown page is a 404 under the same CSP", async () => {
	const res = await get("/docs/no-such-page");
	assert.equal(res.status, 404);
	assert.match(res.headers.get("content-security-policy") ?? "", /default-src 'none'/);
});
