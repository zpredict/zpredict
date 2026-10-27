// Records the real footage the Remotion demo cuts from: headless Chrome on the live app, 1920x1080,
// 30 fps (scripts/video/cdp.mjs). Nothing is staged: the trade take uses an account funded by a real
// testnet deposit (TAG_FILE: a file holding its tag, read here and never printed) and the order
// goes through the live relayers.
//   node scripts/capture.mjs <out dir> [shot ...]
// Shots: home trade deposit account resolved threat evidence landing (default: all). Writes <shot>.mp4 and merges
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
/** Seconds to wait for the fill (a batch normally clears in ~25 s). */
const FILL_WAIT = Number(process.env.FILL_WAIT || 180);

/** Starts recording; mark(name) notes the time into the clip, stop() returns all marks. */
async function take(b, file) {
	const t0 = Date.now();
	const marks = {};
	const stop = await b.record(join(out, file));
	return {
		mark: (name) => {
			marks[name] = +((Date.now() - t0) / 1000).toFixed(2);
			console.error(`${file}: ${name} at ${marks[name]} s`);
		},
		stop: async () => ({ ...marks, length: await stop() }),
	};
}

/** Scrolls the page so `selector`'s top sits `offset` px below the viewport top, over `ms`. */
const scrollTo = (b, selector, offset, ms) =>
	b
		.evaluate(`document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().top`)
		.then((top) => b.scroll(Math.round(top - offset), ms));

/** Signs this browser into the funded account (TAG_FILE; read here, never printed). */
async function signIn(b) {
	if (!process.env.TAG_FILE) throw new Error("this take needs TAG_FILE: a funded account's tag");
	const tag = readFileSync(process.env.TAG_FILE, "utf8").trim();
	await b.goto(APP);
	await b.evaluate(`localStorage.setItem("zp.tag", ${JSON.stringify(tag)})`);
}

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
		if (!process.env.TAG_FILE) throw new Error("trade needs TAG_FILE: a funded account's tag");
		const tag = readFileSync(process.env.TAG_FILE, "utf8").trim();
		await b.goto(APP);
		await b.evaluate(`localStorage.setItem("zp.tag", ${JSON.stringify(tag)})`);
		await b.goto(APP);
		await b.waitFor(`document.querySelectorAll("#markets img").length > 4`);
		// The header CTA reads "Trade now" once the account's balance has loaded.
		await b.waitFor(
			`[...document.querySelectorAll("button")].some((e) => e.textContent.includes("Trade now"))`,
			30_000,
		);
		await sleep(2000);
		const r = await take(b, "trade.mp4");
		await sleep(1500);
		r.mark("start");
		await b.click("button", "Trade now");
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
		for (const ch of process.env.AMOUNT || "0.01") {
			await b.send("Input.insertText", { text: ch });
			await sleep(220);
		}
		await sleep(1500);
		r.mark("send");
		await b.click("button", "Split & send");
		await b.waitFor(`document.querySelector(".xor")`, 30_000);
		r.mark("shares");
		await sleep(1500);
		await b.evaluate(`document.querySelector(".dtabs")?.scrollIntoView({ behavior: "smooth" })`);
		await sleep(3000);
		r.mark("view");
		await b
			.waitFor(`document.querySelector(".xor__fill.is-filled")`, FILL_WAIT * 1000)
			.catch(() => console.error(`trade: no fill within ${FILL_WAIT} s`));
		r.mark("fill");
		await sleep(6000);
		// The close-up: the three shares, their XOR and the fill, whole and clear of the caption band.
		// The trader's column scrolls on its own (.detail__side): bring the XOR card to its top.
		await b.evaluate(`(() => {
			const side = document.querySelector(".detail__side");
			const xor = document.querySelector(".xor");
			const top = side.scrollTop + xor.getBoundingClientRect().top - side.getBoundingClientRect().top;
			side.scrollTo({ top: top - 12, behavior: "smooth" });
		})()`);
		await sleep(1500);
		r.mark("close");
		await sleep(7000);
		const fillText = await b.evaluate(`document.querySelector(".xor__fill")?.textContent`);
		return { ...(await r.stop()), fillText, url: await b.evaluate("location.href") };
	},
	async deposit(b) {
		await signIn(b);
		await b.goto(`${APP}/deposit/`);
		await b.waitFor(`document.querySelector(".deposit__input")`, 30_000);
		await sleep(2500);
		const r = await take(b, "deposit.mp4");
		await sleep(1500);
		r.mark("type");
		await b.evaluate(
			`(() => { const i = document.querySelector(".deposit__input"); i.focus(); i.select(); })()`,
		);
		for (const ch of process.env.DEPOSIT || "1.3") {
			await b.send("Input.insertText", { text: ch });
			await sleep(260);
		}
		await b.waitFor(`document.querySelector(".qr__svg")`, 30_000);
		r.mark("split");
		await sleep(4000);
		await b.evaluate(
			`document.querySelector(".qr").scrollIntoView({ behavior: "smooth", block: "center" })`,
		);
		r.mark("qr");
		await sleep(6000);
		return r.stop();
	},
	async account(b) {
		await signIn(b);
		await b.goto(`${APP}/portfolio/`);
		await b.waitFor(`document.querySelectorAll(".ptable tbody tr").length > 0`, 30_000);
		await sleep(3000);
		const r = await take(b, "account.mp4");
		await sleep(3500);
		// The crosshair across the P&L curve: real pointer events, left to right.
		const box = JSON.parse(
			await b.evaluate(
				`JSON.stringify(document.querySelector(".pnl__plot").getBoundingClientRect())`,
			),
		);
		r.mark("chart");
		for (let k = 0; k <= 30; k++) {
			const x = box.x + 20 + ((box.width - 40) * k) / 30;
			await b.send("Input.dispatchMouseEvent", {
				type: "mouseMoved",
				x,
				y: box.y + box.height / 2,
			});
			await sleep(90);
		}
		await sleep(1500);
		r.mark("table");
		await scrollTo(b, ".ptabs", 120, 1800);
		await sleep(5000);
		return r.stop();
	},
	async resolved(b) {
		const markets = await (await fetch(`${RELAYER}/markets`)).json();
		const id =
			process.env.RESOLVED ||
			markets.filter((m) => m.status === "resolved" && m.outcomeSig).at(-1)?.id;
		await b.goto(`${APP}/trade/?m=${id}`);
		await b.waitFor(`document.querySelector(".proof")`);
		// The rules and the signed outcome mid-frame, above the caption band.
		await b.evaluate(`document.querySelector(".proof").scrollIntoView({ block: "center" })`);
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
