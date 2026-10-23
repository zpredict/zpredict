// Unit tests for the privacy helpers shared by the build gate and the smoke test.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchedUrls, foreignFetches, foreignUrls } from "../scripts/third-party.mjs";

test("foreignUrls keeps third-party hosts and drops ours, dotless and inert ones", () => {
	const text = `a("https://cdn.example.com/x.js") b("https://docs.zpredict.site/y") c("https://a")
		d("http://localhost:3002/z") e("https://react.dev/errors/1")`;
	assert.deepEqual(foreignUrls(text, [/^https:\/\/react\.dev\/errors\//]), [
		"https://cdn.example.com/x.js",
	]);
});

test("fetchedUrls finds what the browser loads, not navigation links", () => {
	const html = `<a href="https://github.com/zpredict/zpredict">repo</a>
		<script src="/_next/a.js" nonce="n"></script>
		<link rel="stylesheet" href="https://fonts.googleapis.com/css2"/>
		<img src="/white/x.png" srcset="/a.png 1x, https://cdn.example.com/b.png 2x"/>
		<div style="background:url('https://img.example.com/c.png')"></div>`;
	const urls = fetchedUrls(html);
	assert.ok(!urls.includes("https://github.com/zpredict/zpredict"));
	assert.deepEqual(foreignFetches(urls).sort(), [
		"https://cdn.example.com/b.png",
		"https://fonts.googleapis.com/css2",
		"https://img.example.com/c.png",
	]);
});

test("foreignFetches lets relative, data: and our own URLs through", () => {
	assert.deepEqual(
		foreignFetches(["/a.js", "data:image/png;base64,AA", "https://docs.zpredict.site/og", "#x"]),
		[],
	);
	assert.deepEqual(foreignFetches(["//evil.example/x.js"]), ["//evil.example/x.js"]);
});
