// Records the pitch-video shots (1920x1080, 30 fps) with headless Chrome.
//   node scripts/video/shots.mjs <out dir> [shot ...]
// Shots: title landing app resolved terminal testnet threat end (default: all). APP and LANDING
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
	"==> YES 60 x10 (A) crosses NO 45 x10 (B) at 0.575",
	"==> mine past the resolve height; every node resolves YES; the MPC pays A",
	"==> relayer 0 impersonates A (its key share + A's id) to withdraw everything: refused",
	"==> relayer 1 impersonates A (its key share + A's id) to withdraw everything: refused",
	"==> relayer 2 impersonates A (its key share + A's id) to withdraw everything: refused",
	"==> A withdraws everything to a fresh shielded address",
	"==> done: deposit -> trade -> resolution -> withdrawal 8e2ed51a…",
	"# the payout transaction, PR #86 run",
	"txid 65355d60…25cd980  version 6  ironwood actions 2  transparent in+out 0",
	"    Balance:   0.29240000 REG",
];

// One full cycle on the live demo, from apps/docs/content/docs/evidence.mdx (PR #157).
const TESTNET = [
	"# one full cycle on the live demo, 2026-10-24 UTC (docs: Evidence)",
	"==> deposit 0.25 TAZ to the relayers' 2-of-3 escrow",
	"txid 8a4bc247…b62de82d  testnet height 4,537,064",
	"==> credited once all three relayers scanned it",
	"==> filled inside MPC: rolling market #1073528, YES 5 shares at 50¢",
	"==> outcome YES from mainnet block 3,529,392, FROST-signed 2-of-3",
	"==> withdrawal: one batched 2-of-3 payout to an Ironwood address",
	"txid 67d93312…10620a16  testnet height 4,539,998",
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
		// on the same market, with its own judge account. Both untick the demo self-trade, so
		// the fill is a real cross between two accounts. The video says so.
		const ready = `location.pathname.startsWith("/trade") && document.querySelector("#counterparty")`;
		const untick = `document.querySelector("#counterparty").checked && document.querySelector("#counterparty").click()`;
		const other = await launch();
		await other.goto(APP);
		await other.click("button", "Judge mode");
		await other.waitFor(ready, 60_000);
		await other.goto(`${APP}/trade/?m=${MARKET}&side=no`);
		await other.waitFor(`document.querySelector("label.side--no.is-on") && ${ready}`);
		await other.evaluate(untick);
		await b.goto(APP);
		// Set before the Judge click (a client-side navigation keeps it) and re-applied by a
		// MutationObserver, which runs before the next paint, so no frame misses it:
		// - /trade at 80% zoom: the Relayer View and the trader's pane fit side by side;
		// - the amount as en-US text (Chrome on macOS draws number inputs in the OS region, 0,05);
		// - never film key bytes: until #159 ships, the key field (bytes 10..26) of the order share
		//   in each Relayer View pinned row is masked, as the order panel already does (HexBytes).
		await b.evaluate(`new MutationObserver(() => {
			const root = document.documentElement;
			if (location.pathname.startsWith("/trade") && root.style.zoom !== "0.8") root.style.zoom = "0.8";
			const amount = document.querySelector("#amount");
			if (amount && amount.type !== "text") amount.type = "text";
			for (const k of document.querySelectorAll(".pinned__k")) {
				const v = k.nextElementSibling;
				const b = v?.textContent.split(" ");
				if (k.textContent === "order" && b?.length === 26 && b[10] !== "··")
					v.textContent = [...b.slice(0, 10), ...b.slice(10).fill("··")].join(" ");
			}
		}).observe(document, { subtree: true, childList: true, characterData: true }), true`);
		const stop = await rec();
		const marks = { home: Date.now() };
		await sleep(3000);
		// The market list: Polymarket mirrors with images, Zcash-network and rolling markets.
		await b.evaluate(
			`scrollTo({ top: document.querySelector("#markets").getBoundingClientRect().top + scrollY - 110, behavior: "smooth" })`,
		);
		await sleep(5500);
		marks.judge = Date.now();
		await b.click("button", "Judge mode");
		await b.waitFor(`${ready} && document.documentElement.style.zoom === "0.8"`, 60_000);
		await sleep(2500);
		await b.click("label[for=counterparty]");
		await sleep(1200);
		await b.click("label.side--yes");
		await sleep(1500);
		await b.click("button", "Split & send");
		marks.sent = Date.now();
		await other.click("button", "Split & send");
		await b.waitFor(
			`document.querySelector(".pinned.is-on") && document.querySelector(".xor")`,
			20_000,
		);
		await b.evaluate(`document.querySelector(".dtabs").scrollIntoView({ behavior: "smooth" });
			const side = document.querySelector(".detail__side");
			side.scrollTo({ top: document.querySelector(".xor").offsetTop - side.offsetTop - 12, behavior: "smooth" })`);
		// Wait for the fill (a crossing batch), at most 3 minutes.
		await b
			.waitFor(`document.querySelector(".xor__fill.is-filled")`, 180_000)
			.catch(() => console.error("app: no fill within 3 min"));
		marks.fill = Date.now();
		await sleep(9000);
		const length = await stop();
		const end = Date.now();
		const at = (t) => +(length - (end - t) / 1000).toFixed(2);
		const text = await b.evaluate(`document.querySelector(".xor__fill")?.textContent`);
		console.error(
			"other trader:",
			await other.evaluate(`document.querySelector(".xor__fill")?.textContent`),
		);
		other.close();
		// Times into the clip, for the edit (the wait is cut into a time-lapse).
		return { length, judge: at(marks.judge), sent: at(marks.sent), fill: at(marks.fill), text };
	},
	async resolved(b, rec) {
		const markets = await (await fetch("https://r0.zpredict.site/markets")).json();
		// The newest resolved market with its 2-of-3 outcome signature.
		const id =
			RESOLVED || markets.filter((m) => m.status === "resolved" && m.outcomeSig).at(-1)?.id;
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
			`show("terminal", { badge: "regtest", title: "scripts/relayer-e2e.sh · log excerpt from real runs", lines: ${JSON.stringify(E2E)}, typeMs: 20, lineMs: 480 })`,
		);
		await sleep(9000);
		return stop();
	},
	async testnet(b, rec) {
		await b.goto(cards);
		const stop = await rec();
		await b.evaluate(
			`show("terminal", { badge: "testnet", title: "app.zpredict.site · deposit to payout, real Zcash testnet", lines: ${JSON.stringify(TESTNET)}, typeMs: 18, lineMs: 650 })`,
		);
		await sleep(7000);
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
