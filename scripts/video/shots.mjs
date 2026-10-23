// Records the pitch-video shots (1920x1080, 30 fps) with headless Chrome.
//   node scripts/video/shots.mjs <out dir> [shot ...]
// Shots: title landing app resolved terminal threat end (default: all). APP and LANDING
// override the live hosts (e.g. APP=http://localhost:3000 with `pnpm --filter @zpredict/web dev:mock`).
// The app shot uses judge mode on the live relayers: a real demo account and a real order.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, sleep } from "./cdp.mjs";

const [out, ...only] = process.argv.slice(2);
if (!out) throw new Error("usage: shots.mjs <out dir> [shot ...]");
const APP = process.env.APP || "https://app.zpredict.site";
const LANDING = process.env.LANDING || "https://zpredict.site";
const RESOLVED = process.env.RESOLVED_MARKET; // a resolved market id; default: the newest one
const MARKET = process.env.MARKET || 1; // the open market the app shot trades (judge mode opens the first)
const cards = new URL("cards.html", import.meta.url).href;
const repo = new URL("../../", import.meta.url).pathname;

// Real output of scripts/relayer-e2e.sh (log lines are the script's own; values are from the
// runs reported in PR #87, which added the forged withdrawals, and PR #86).
const E2E = [
	"$ scripts/relayer-e2e.sh",
	"# PR #87 run: three real relayers, real 3-party MPC, settlement on",
	"==> deposits: credited once all three relayers scanned them",
	"A 5000, B 5000 half-ticks (25 units each)",
	"==> YES 60 x10 (A) crosses NO 45 x10 (B) at 0.575",
	"==> mine past the resolve height; every node resolves YES; the MPC pays A",
	"A 5850 (3850 + 10 contracts x 1 unit), B 4150",
	"==> relayer 0 impersonates A (its key share + A's id) to withdraw everything: refused",
	"==> relayer 1 impersonates A (its key share + A's id) to withdraw everything: refused",
	"==> relayer 2 impersonates A (its key share + A's id) to withdraw everything: refused",
	"==> A withdraws everything to a fresh shielded address",
	"==> done: deposit -> trade -> resolution -> withdrawal 8e2ed51a…",
	"# the payout transaction, PR #86 run",
	"txid 65355d60…25cd980  version 6  ironwood actions 2  transparent in+out 0",
	"    Balance:   0.29240000 REG",
];

/** PRIVACY.md "Who learns what", as [party, learns, never learns] rows. */
function threatRows() {
	const md = readFileSync(join(repo, "PRIVACY.md"), "utf8");
	const table = md.split("## Who learns what")[1].split("\n## ")[0];
	return table
		.split("\n")
		.filter((l) => l.startsWith("| ") && !l.startsWith("| Party") && !l.startsWith("|---"))
		.map((l) =>
			l
				.slice(2, -2)
				.split(" | ")
				.map((c) =>
					c
						.replace(/\*\*|`/g, "")
						.replace(/⚠️/g, "⚠")
						.trim(),
				),
		);
}

const shots = {
	async title(b, rec) {
		await b.goto(cards);
		const stop = await rec();
		await b.evaluate(
			`show("title", { lines: ["Prediction markets today:", "every bet is public.", "And people get found."] })`,
		);
		await sleep(9000);
		return stop();
	},
	async landing(b, rec) {
		await b.goto(LANDING);
		await sleep(2500); // preloader
		const stop = await rec();
		await sleep(5000);
		await b.scroll(3100, 14000); // the hero journey and its showcase
		await sleep(3000);
		return stop();
	},
	async app(b, rec) {
		// Live markets have no bots, so a second trader in another (off-camera) browser takes NO
		// on the same market, with its own judge account. The video says so.
		const other = await launch();
		await other.goto(APP);
		await other.click("button", "Judge mode");
		await other.waitFor(
			`location.pathname.startsWith("/trade") && document.querySelector(".ticket")`,
		);
		await other.goto(`${APP}/trade/?m=${MARKET}&side=no`);
		await other.waitFor(`document.querySelector("label.side--no.is-on")`);
		await b.goto(APP);
		// 90% zoom so the opened fill, at the foot of the trader pane, stays in frame.
		const zoom = `document.documentElement.style.zoom = "0.9"`;
		await b.evaluate(zoom);
		const stop = await rec();
		await sleep(3500);
		await b.click("button", "Judge mode");
		await b.waitFor(`location.pathname.startsWith("/trade") && document.querySelector(".ticket")`);
		await b.evaluate(zoom);
		await sleep(3000);
		await b.click("label.side--yes");
		await sleep(1500);
		await b.click("button", "Split & send");
		const marks = { sent: Date.now() };
		await other.click("button", "Split & send");
		await b.waitFor(`document.querySelector(".pinned.is-on")`, 20_000);
		// Wait for the fill (a crossing batch), at most 3 minutes.
		await b
			.waitFor(
				`[...document.querySelectorAll(".orow__fill")].some((e) => e.textContent !== "pending")`,
				180_000,
			)
			.catch(() => console.error("app: no fill within 3 min"));
		marks.fill = Date.now();
		await sleep(8000);
		const length = await stop();
		const end = Date.now();
		const at = (t) => +(length - (end - t) / 1000).toFixed(2);
		const text = await b.evaluate(`document.querySelector(".orow__fill")?.textContent`);
		console.error(
			"other trader:",
			await other.evaluate(`document.querySelector(".orow__fill")?.textContent`),
		);
		other.close();
		// Times into the clip, for the edit (the wait is cut into a time-lapse).
		return { length, sent: at(marks.sent), fill: at(marks.fill), text };
	},
	async resolved(b, rec) {
		const markets = await (await fetch("https://r0.zpredict.site/markets")).json();
		const id = RESOLVED || markets.filter((m) => m.status === "resolved").at(-1)?.id;
		await b.goto(`${APP}/trade/?m=${id}`);
		await b.waitFor(`document.querySelector(".proof")`);
		await sleep(1500);
		const stop = await rec();
		await sleep(11000);
		return stop();
	},
	async terminal(b, rec) {
		await b.goto(cards);
		const stop = await rec();
		await b.evaluate(
			`show("terminal", { title: "scripts/relayer-e2e.sh · log excerpt from real runs", lines: ${JSON.stringify(E2E)}, typeMs: 20, lineMs: 480 })`,
		);
		await sleep(9000);
		return stop();
	},
	async threat(b, rec) {
		await b.goto(cards);
		await b.evaluate(`show("threat", { rows: ${JSON.stringify(threatRows())} })`);
		await sleep(500);
		const stop = await rec();
		await sleep(4000);
		const dy = await b.evaluate("document.documentElement.scrollHeight - innerHeight");
		await b.scroll(dy, 16000);
		await sleep(5000);
		return stop();
	},
	async end(b, rec) {
		await b.goto(cards);
		const stop = await rec();
		await b.evaluate(`show("end")`);
		await sleep(8000);
		return stop();
	},
};

const meta = {};
for (const name of only.length ? only : Object.keys(shots)) {
	const b = await launch();
	try {
		meta[name] = await shots[name](b, () => b.record(join(out, `${name}.mp4`)));
		console.log(name, meta[name]);
	} finally {
		b.close();
	}
}
const file = join(out, "shots.json");
const old = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
writeFileSync(file, JSON.stringify({ ...old, ...meta }, null, 2));
process.exit(0);
