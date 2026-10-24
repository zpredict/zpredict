// The route-scoped Turnstile exception (#133): the privacy gate and the per-route CSP.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

const here = new URL(".", import.meta.url).pathname;
const CF = "https://challenges.cloudflare.com/turnstile/v0/api.js";

function site(files) {
	const d = mkdtempSync(join(tmpdir(), "zp-out-"));
	for (const [p, body] of Object.entries(files)) {
		mkdirSync(dirname(join(d, p)), { recursive: true });
		writeFileSync(join(d, p), body);
	}
	return d;
}

const gate = (d) => spawnSync("node", [join(here, "privacy.mjs"), d], { encoding: "utf8" });
const page = (...chunks) =>
	chunks.map((c) => `<script src="/_next/static/chunks/${c}"></script>`).join("");

test("Turnstile may appear in a chunk only the faucet route loads", () => {
	const d = site({
		"index.html": page("shared.js"),
		"faucet/index.html": page("shared.js", "faucet.js"),
		"_next/static/chunks/shared.js": "fetch('https://r0.zpredict.site/health')",
		"_next/static/chunks/faucet.js": `s.src="${CF}"; a.href="https://zecfaucet.com/"`,
	});
	const r = gate(d);
	assert.equal(r.status, 0, r.stderr);
});

test("Turnstile in a chunk another route loads fails the gate", () => {
	const d = site({
		"index.html": page("shared.js"),
		"faucet/index.html": page("shared.js"),
		"_next/static/chunks/shared.js": `s.src="${CF}"`,
	});
	const r = gate(d);
	assert.equal(r.status, 1);
	assert.match(r.stderr, /shared\.js: https:\/\/challenges\.cloudflare\.com/);
});

test("any other third party fails, even on the faucet route", () => {
	const d = site({
		"faucet/index.html": page("faucet.js"),
		"_next/static/chunks/faucet.js": "fetch('https://example.com/x')",
	});
	assert.equal(gate(d).status, 1);
});

test("the CSP allows Turnstile on /faucet/ only", () => {
	const d = site({ "index.html": "<p>hi</p>" });
	const out = join(d, "csp.caddy");
	const prepare = join(here, "../../../deploy/static/prepare.mjs");
	const args = [prepare, d, out, "https://r0.zpredict.site,https://faucet.zpredict.site"];
	const r = spawnSync("node", [...args, "https://challenges.cloudflare.com"], { encoding: "utf8" });
	assert.equal(r.status, 0, r.stderr);
	const lines = readFileSync(out, "utf8").trim().split("\n");
	assert.deepEqual(
		lines.map((l) => l.split(" ").slice(0, 3).join(" ")),
		[
			"@csp_faucet path /faucet",
			"header @csp_faucet Content-Security-Policy",
			"@csp_rest not path",
			"header @csp_rest Content-Security-Policy",
		],
	);
	const [faucet, rest] = [lines[1], lines[3]];
	for (const d of ["script-src", "connect-src", "frame-src"]) {
		assert.match(faucet, new RegExp(`${d} [^;]*https://challenges\\.cloudflare\\.com`));
	}
	assert.ok(!rest.includes("cloudflare"), rest);
	assert.ok(!rest.includes("frame-src"), "other routes frame nothing");
	assert.match(
		rest,
		/connect-src 'self' https:\/\/r0\.zpredict\.site https:\/\/faucet\.zpredict\.site;/,
	);

	// Without faucet origins (the landing site): one CSP for every path.
	spawnSync("node", args.slice(0, 3));
	assert.match(readFileSync(out, "utf8"), /^header Content-Security-Policy "default-src 'none'/);
});

test("only the onion relayers this build was given pass the gate (#90)", () => {
	const onion = `http://${"a".repeat(56)}.onion`;
	const d = site({ "index.html": `<script>fetch("${onion}/health")</script>` });
	const given = `${onion},http://b.onion,http://c.onion`;
	const env = { ...process.env, NEXT_PUBLIC_RELAYERS_ONION: given };
	const ok = spawnSync("node", [join(here, "privacy.mjs"), d], { encoding: "utf8", env });
	assert.equal(ok.status, 0, ok.stderr);
	const { NEXT_PUBLIC_RELAYERS_ONION: _, ...bare } = process.env;
	assert.equal(spawnSync("node", [join(here, "privacy.mjs"), d], { env: bare }).status, 1);
});
