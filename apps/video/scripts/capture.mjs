// Records the real footage the Remotion demo cuts from: headless Chrome on the live app, 1920x1080,
// 30 fps (scripts/video/cdp.mjs). Nothing is staged: judge mode claims a real demo account and the
// order goes through the live relayers.
//   node scripts/capture.mjs <out dir> [shot ...]
// Shots: home trade resolved threat evidence landing (default: all). Writes <shot>.mp4 and merges
// the marks (seconds into each clip) into <out dir>/shots.json; copy the ones you use into
// src/config.ts. APP / DOCS / LANDING override the hosts; MARKET picks the traded market id.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, sleep } from "../../../scripts/video/cdp.mjs";

const [out, ...only] = process.argv.slice(2);
if (!out) throw new Error("usage: capture.mjs <out dir> [shot ...]");
mkdirSync(out, { recursive: true });
const APP = process.env.APP || "https://app.zpredict.site";
const DOCS = process.env.DOCS || "https://docs.zpredict.site";
const LANDING = process.env.LANDING || "https://zpredict.site";
const RELAYER = process.env.RELAYER || "https://r0.zpredict.site";

/** Starts recording; mark(name) notes the time into the clip, stop() returns all marks. */
async function take(b, file) {
	const t0 = Date.now();
	const marks = {};
	const stop = await b.record(join(out, file));
	return {
		mark: (name) => {
			marks[name] = +((Date.now() - t0) / 1000).toFixed(2);
		},
		stop: async () => ({ ...marks, length: await stop() }),
	};
}

/** Scrolls the page so `selector`'s top sits `offset` px below the viewport top, over `ms`. */
const scrollTo = (b, selector, offset, ms) =>
	b
		.evaluate(`document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().top`)
		.then((top) => b.scroll(Math.round(top - offset), ms));

const shots = {
	async home(b) {
		await b.goto(APP);
		await b.waitFor(`document.querySelectorAll("#markets img").length > 4`);
		await sleep(2500);
		const r = await take(b, "home.mp4");
		await sleep(4000);
		r.mark("scroll");
		await scrollTo(b, "#markets", 100, 2600);
		r.mark("grid");
		await sleep(4500);
		r.mark("scroll2");
		await b.scroll(760, 2600);
		r.mark("grid2");
		await sleep(4000);
		return r.stop();
	},
	async trade(b) {
		await b.goto(APP);
		await b.waitFor(`document.querySelectorAll("#markets img").length > 4`);
		await sleep(2000);
		const r = await take(b, "trade.mp4");
		await sleep(1500);
		r.mark("judge");
		await b.click("button", "Judge mode");
		await b.waitFor(
			`location.pathname.startsWith("/trade") && document.querySelector("#amount")`,
			60_000,
		);
		r.mark("ticket");
		if (process.env.MARKET) {
			await b.goto(`${APP}/trade/?m=${process.env.MARKET}`);
			await b.waitFor(`document.querySelector("#amount")`, 30_000);
			r.mark("market");
		}
		await sleep(2500);
		r.mark("yes");
		await b.click("label.side--yes");
		await sleep(1200);
		// Type the amount with real key events into the real field.
		await b.evaluate(
			`(() => { const a = document.querySelector("#amount"); a.focus(); a.select(); })()`,
		);
		r.mark("amount");
		for (const ch of process.env.AMOUNT || "0.1") {
			await b.send("Input.insertText", { text: ch });
			await sleep(220);
		}
		await sleep(1500);
		const box = await b.evaluate(`document.querySelector("#counterparty") ? "checkbox" : "none"`);
		r.mark("send");
		await b.click("button", "Split & send");
		await b.waitFor(`document.querySelector(".xor")`, 30_000);
		r.mark("shares");
		await sleep(1500);
		await b.evaluate(`document.querySelector(".dtabs")?.scrollIntoView({ behavior: "smooth" })`);
		await sleep(3000);
		r.mark("view");
		await b
			.waitFor(`document.querySelector(".xor__fill.is-filled")`, 180_000)
			.catch(() => console.error("trade: no fill within 3 min"));
		r.mark("fill");
		await sleep(9000);
		const fill = await b.evaluate(`document.querySelector(".xor__fill")?.textContent`);
		return {
			...(await r.stop()),
			fill,
			counterpartyToggle: box,
			url: await b.evaluate("location.href"),
		};
	},
	async resolved(b) {
		const markets = await (await fetch(`${RELAYER}/markets`)).json();
		const id =
			process.env.RESOLVED ||
			markets.filter((m) => m.status === "resolved" && m.outcomeSig).at(-1)?.id;
		await b.goto(`${APP}/trade/?m=${id}`);
		await b.waitFor(`document.querySelector(".proof")`);
		await sleep(1500);
		const r = await take(b, "resolved.mp4");
		await sleep(9000);
		return { ...(await r.stop()), id };
	},
	async threat(b) {
		await b.goto(`${APP}/threat-model/`);
		await sleep(2500);
		const r = await take(b, "threat.mp4");
		await sleep(9000);
		return r.stop();
	},
	async evidence(b) {
		await b.goto(`${DOCS}/docs/evidence`);
		await sleep(2000);
		// Browser zoom (as Cmd +) so the txids are legible at 1080p; then the testnet cycle table.
		await b.evaluate(`document.documentElement.style.zoom = "1.5"`);
		await sleep(500);
		await b.evaluate(`(() => {
			const t = [...document.querySelectorAll("table")].find((t) => t.textContent.includes("8a4bc247"));
			t.scrollIntoView({ block: "center" });
		})()`);
		await sleep(1500);
		const r = await take(b, "evidence.mp4");
		await sleep(9000);
		return r.stop();
	},
	async landing(b) {
		await b.goto(LANDING);
		await sleep(3000); // preloader
		const r = await take(b, "landing.mp4");
		await sleep(9000);
		return r.stop();
	},
};

const file = join(out, "shots.json");
const meta = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
for (const name of only.length ? only : Object.keys(shots)) {
	const b = await launch();
	try {
		// Numbers as 0.1, whatever the machine's locale (Chrome draws number inputs in it).
		await b.send("Emulation.setLocaleOverride", { locale: "en-US" });
		meta[name] = await shots[name](b);
		console.log(name, meta[name]);
		writeFileSync(file, JSON.stringify(meta, null, 2));
	} finally {
		b.close();
	}
}
process.exit(0);
