// The app in headless Chrome against the mock relayers, served like production (static
// export, the deploy's CSP): judge mode → an order with the demo counterparty → its fill →
// chart crosshair → withdraw (judge note) → deposit (escrow address in the request). Every
// request the page makes must go to localhost. Run `pnpm --filter @zpredict/web e2e`
// (builds with the ports below first). CHROME= the browser binary (default: macOS Chrome).
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { after, before, test } from "node:test";
import { launch } from "../../../scripts/video/cdp.mjs";

const MOCK_PORTS = [4911, 4912, 4913];
const ESCROW_UA = "utest1e2eescrowaddress";
const web = new URL("../", import.meta.url).pathname;
const out = join(web, "out");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

let mock;
let site;
let b;
let base;
const requests = [];
const errors = [];

/** The deploy's CSP for this build (deploy/static/prepare.mjs), as the header value. */
function csp() {
	const file = join(mkdtempSync(join(tmpdir(), "zp-csp-")), "csp.caddy");
	const relayers = MOCK_PORTS.map((p) => `http://localhost:${p}`).join(",");
	const prepare = new URL("../../../deploy/static/prepare.mjs", import.meta.url).pathname;
	execFileSync(process.execPath, [prepare, out, file, relayers]);
	return readFileSync(file, "utf8").match(/"(.*)"/)[1];
}

before(async () => {
	assert.ok(existsSync(join(out, "index.html")), "build first: pnpm --filter @zpredict/web e2e");
	mock = spawn(process.execPath, ["mock-relayer/src/server.mjs"], {
		cwd: web,
		// No bots: only this test trades, so the pair fills against itself, as on the hosted relayers.
		env: {
			...process.env,
			MOCK_PORTS: MOCK_PORTS.join(","),
			MOCK_BATCH_MS: "1500",
			MOCK_BOT_MS: "3600000",
		},
		stdio: "ignore",
	});
	const policy = csp();
	site = createServer((req, res) => {
		const path = new URL(req.url, "http://x").pathname;
		let file = join(out, path.endsWith("/") ? `${path}index.html` : path);
		if (!existsSync(file)) file = join(out, "404.html");
		res.writeHead(200, {
			"content-type": TYPES[extname(file)] ?? "application/octet-stream",
			"content-security-policy": policy,
		});
		res.end(readFileSync(file));
	}).listen(0);
	base = `http://localhost:${site.address().port}`;
	for (const p of MOCK_PORTS) {
		for (let i = 0; i < 50 && !(await fetch(`http://localhost:${p}/health`).catch(() => null)); i++)
			await new Promise((r) => setTimeout(r, 200));
	}
	b = await launch();
	await b.send("Network.enable");
	b.on("Network.requestWillBeSent", ({ request }) => requests.push(request.url));
	b.on("Runtime.exceptionThrown", ({ exceptionDetails }) => errors.push(exceptionDetails.text));
	b.on("Log.entryAdded", ({ entry }) => entry.level === "error" && errors.push(entry.text));
	await b.send("Log.enable");
});

after(() => {
	b?.close();
	mock?.kill();
	site?.close();
});

/** Clicks the first `selector` whose text includes `text` (no animation delay). */
const click = (selector, text = "") =>
	b.evaluate(`(() => {
		const el = [...document.querySelectorAll(${JSON.stringify(selector)})]
			.find((e) => e.textContent.includes(${JSON.stringify(text)}));
		if (!el) throw new Error("no ${selector} with ${text}");
		el.click();
		return true;
	})()`);
const text = (selector) =>
	b.evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? ""`);

test("judge mode to a fill, chart, withdraw and deposit", async () => {
	await b.goto(`${base}/`);
	await b.waitFor(
		`[...document.querySelectorAll(".judge button")].some((e) => e.textContent.includes("Judge mode"))`,
	);
	await click(".judge button", "Judge mode");
	await b.waitFor(`location.pathname === "/trade/"`);
	await b.goto(`${base}/trade/?m=1`);

	// A judge account gets the demo counterparty, on by default.
	await b.waitFor(`document.querySelector("#counterparty")?.checked === true`);
	await b.waitFor(
		`[...document.querySelectorAll(".ticket button.cta")].some((e) => e.textContent.includes("Split & send") && !e.disabled)`,
	);
	await click(".ticket button.cta", "Split & send");
	await b.waitFor(`document.querySelector(".xor__fill.is-filled")`, 20_000).catch(async (e) => {
		const mine = JSON.parse(await b.evaluate(`localStorage.getItem("zp.orders")`));
		const seen = [];
		for (const o of mine) {
			for (const [i, p] of MOCK_PORTS.entries()) {
				const r = await fetch(`http://localhost:${p}/orders/${o.orderId}?token=${o.tokens[i]}`);
				seen.push(`${o.orderId.slice(0, 6)} ${o.status} r${i}: ${r.status} ${await r.text()}`);
			}
		}
		throw new Error(`${e.message}: ${await text(".xor")}\n${seen.join("\n")}`);
	});
	assert.match(await text(".xor__fill"), /^Filled 5 @ \d+\.\d¢ average/);
	assert.match(await text(".xor__counter"), /Demo counterparty \(self-trade\)/);

	// The account key never shows, in the plaintext or in any of the three shares (#153).
	const keys = await b.evaluate(
		`[...document.querySelectorAll(".xor .f-key .hexbytes__bytes")].map((e) => e.textContent)`,
	);
	assert.ok(keys.length >= 4, "key groups rendered");
	for (const k of keys) assert.match(k, /^(··)( ··)*$/);

	// The crosshair follows the pointer: a time on top and each series' price.
	const box = await b.evaluate(`(() => {
		const r = document.querySelector(".pchart__plot").getBoundingClientRect();
		return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
	})()`);
	await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...box });
	await b.waitFor(`document.querySelector(".pchart__hover .pchart__time")?.textContent`);
	assert.match(await text(".pchart__hover .pchart__pct"), /^\d+%$/);

	// Withdraw: a judge account gets the note, never the form.
	await click(".dtabs__tab", "Your positions");
	await click(".dtabs__pos summary", "Withdraw");
	await b.waitFor(`document.querySelector(".dtabs__pos details[open]")`);
	const withdraw = await b.evaluate(
		`[...document.querySelectorAll(".dtabs__pos details")].find((d) => d.textContent.startsWith("Withdraw")).textContent`,
	);
	assert.match(withdraw, /judge-mode credit can.t be withdrawn/);
	assert.ok(!(await b.evaluate(`!!document.querySelector("#withdraw-address")`)));

	// Deposit: a fresh (non-judge) tag gets a payment request to the escrow address.
	await click(".dtabs__pos summary", "Deposit");
	await click(".dtabs__pos button", "Forget this account");
	await b.waitFor(
		`[...document.querySelectorAll(".dtabs__pos button")].some((e) => e.textContent.includes("Create account tag"))`,
	);
	await click(".dtabs__pos button", "Create account tag");
	await b.waitFor(`document.querySelector(".deposit__ua")`);
	assert.match(await text(".deposit__ua"), new RegExp(`^zcash:${ESCROW_UA}\\?amount=0\\.05&memo=`));

	assert.ok(requests.some((u) => u.startsWith(`http://localhost:${MOCK_PORTS[2]}/orders`)));
	const foreign = requests.filter((u) => !/^(https?:\/\/localhost[:/]|data:|blob:)/.test(u));
	assert.deepEqual(foreign, [], "requests outside localhost");
	assert.deepEqual(errors, [], "page errors");
});
