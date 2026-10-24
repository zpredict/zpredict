// Market catalog from Polymarket (#148): picks the top active binary Yes/No markets by
// volume from Gamma and writes them as mirrored markets (packages/plugins/polymarket).
//
//   node scripts/polymarket-catalog.mjs [count]   (default 18 new markets, macOS: needs sips)
//
// Writes, all committed:
// - deploy/production/relayer.toml: the [[markets]] between the "BEGIN/END polymarket-catalog"
//   markers (the Zcash markets and [rolling] outside them stay as they are);
// - apps/web/public/markets/<id>.jpg: each market's image, 112 px square, served from our
//   origin, so the browser never contacts Polymarket or its CDN (PRIVACY.md);
// - apps/web/mock-relayer/src/catalog.json: the same markets for the mock relayers.
//
// Picks: open markets with outcomes exactly ["Yes", "No"], ending between 48 h from now and
// the end of 2027, Yes between 4% and 96%, at most 2 per event and 3 per category, no
// death or violence markets. Ids are stable: 100 + the conditionId's first 32 bits mod
// 899,900 (below the rolling ids, 1,000,000+). Ids 11-13 are pinned: saved progress and
// balances refer to them. Trading here closes a day before Polymarket's end date, at the
// mainnet height that time maps to (75 s blocks, 25 s from NU7, as markets/rolling.rs).
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const GAMMA = "https://gamma-api.polymarket.com";
const root = new URL("../", import.meta.url).pathname;
const TOML = join(root, "deploy/production/relayer.toml");
const IMAGES = join(root, "apps/web/public/markets");
const MOCK = join(root, "apps/web/mock-relayer/src/catalog.json");
const COUNT = Number(process.argv[2] ?? 18);

// Trading on the pinned three closes at block 3,540,470 (Nov 3, 12:00 UTC, before US polls).
const PINNED = [
	{ id: 11, slug: "will-the-democratic-party-control-the-house-after-the-2026-midterm-elections" },
	{ id: 12, slug: "will-the-republican-party-control-the-house-after-the-2026-midterm-elections" },
	{ id: 13, slug: "will-the-democrats-win-the-texas-senate-race-in-2026" },
].map((p) => ({ ...p, closeHeight: 3_540_470 }));
const HOUSE = { id: "house-2026", title: "Which party will win the House in 2026?" };

// Nominal mainnet time (markets/rolling.rs): anchor, 75 s blocks until NU7, 25 s after.
const ANCHOR = { height: 3_527_437, t: Date.parse("2026-10-23T04:25:00Z") / 1000 };
const FAST_FROM = 3_543_405;
function heightAt(ms) {
	const t = ms / 1000 - ANCHOR.t;
	const slow = (FAST_FROM - ANCHOR.height) * 75;
	return t <= slow ? ANCHOR.height + Math.ceil(t / 75) : FAST_FROM + Math.ceil((t - slow) / 25);
}

const SKIP =
	/\b(die|dies|death|dead|kill|killed|assassinat\w*|war|invade\w*|invasion|strikes?|military|clash|attack\w*|nuclear|bomb\w*|missile|hostage|ceasefire|disarm|out as|out before|out by|regime|leader|jesus|pandemic)\b/i;
const CATEGORIES = [
	["Crypto", /^(crypto|bitcoin|ethereum)$/i],
	["Sports", /^sports$/i],
	["Economy", /^(economy|fed|finance|business)$/i],
	["Tech", /^(tech|ai|big tech)$/i],
	["Science", /^(science|climate & science|weather)$/i],
	["Culture", /^culture$/i],
	["World", /^(geopolitics|world)$/i],
	["Politics", /^politics$/i],
];
const category = (tags) =>
	CATEGORIES.find(([, re]) => tags.some((t) => re.test(t.label)))?.[0] ?? "Polymarket";

async function json(url) {
	const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
	if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
	return r.json();
}

const list = (s) => JSON.parse(s ?? "[]");
const binary = (m) => JSON.stringify(list(m.outcomes)) === '["Yes","No"]';
const yes = (m) => Number(list(m.outcomePrices)[0]);
const idOf = (conditionId) => 100 + (Number.parseInt(conditionId.slice(2, 10), 16) % 899_900);

/** The first paragraphs of a Polymarket description, up to ~500 characters. */
function trim(text) {
	let out = "";
	for (const p of text
		.split(/\n+/)
		.map((s) => s.replace(/\s+/g, " ").trim())
		.filter(Boolean)) {
		if (out && out.length + p.length > 500) break;
		out += (out ? " " : "") + p;
	}
	return out;
}

function rules(m, closeHeight) {
	const close = closeHeight.toLocaleString("en-US");
	const when = new Date(timeAt(closeHeight) * 1000).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC",
	});
	return `${trim(m.description ?? "")} Mirrored from Polymarket: YES if Polymarket settles it Yes (UMA optimistic oracle); No, or a 50-50 settlement, resolves NO. Trading here closes at block ${close} (about ${when}); the outcome follows whenever Polymarket settles.`;
}

/** Nominal unix time of height `h` (inverse of heightAt). */
function timeAt(h) {
	const slow = Math.min(h, FAST_FROM) - ANCHOR.height;
	return ANCHOR.t + slow * 75 + Math.max(0, h - FAST_FROM) * 25;
}

async function image(url, id) {
	const dir = mkdtempSync(join(tmpdir(), "zp-img-"));
	const src = join(dir, "src");
	const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
	if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
	writeFileSync(src, Buffer.from(await r.arrayBuffer()));
	const size = (k) =>
		Number(execFileSync("sips", ["-g", k, src], { encoding: "utf8" }).match(/: (\d+)/)[1]);
	const side = size("pixelWidth") > size("pixelHeight") ? "--resampleHeight" : "--resampleWidth";
	const out = join(IMAGES, `${id}.jpg`);
	execFileSync("sips", [side, "112", src, "--out", join(dir, "r.png")], { stdio: "ignore" });
	execFileSync(
		"sips",
		["-c", "112", "112", "-s", "format", "jpeg", "-s", "formatOptions", "75"].concat([
			join(dir, "r.png"),
			"--out",
			out,
		]),
		{ stdio: "ignore" },
	);
	return `${id}.jpg`;
}

// Pinned markets first, then events by volume.
const picked = [];
for (const p of PINNED) {
	const m = await json(`${GAMMA}/markets/slug/${p.slug}`);
	picked.push({ ...p, m, category: "Politics", event: p.id === 13 ? undefined : HOUSE });
}
const now = Date.now();
const min = new Date(now + 48 * 3600e3).toISOString();
const max = "2027-12-31T23:59:59Z";
const events = [];
for (let offset = 0; offset < 300; offset += 100)
	events.push(
		...(await json(
			`${GAMMA}/events?active=true&closed=false&order=volume&ascending=false&limit=100&offset=${offset}&end_date_min=${min}&end_date_max=${max}`,
		)),
	);
const pinned = new Set(picked.map((p) => p.m.conditionId));
const perCategory = new Map();
for (const e of events) {
	if (picked.length >= PINNED.length + COUNT) break;
	const markets = e.markets ?? [];
	if (markets.some((m) => pinned.has(m.conditionId))) continue;
	const cat = category(e.tags ?? []);
	if (SKIP.test(e.title) || (e.tags ?? []).some((t) => SKIP.test(t.label))) continue;
	const ok = markets
		.filter(
			(m) =>
				m.active &&
				!m.closed &&
				binary(m) &&
				/^0x[0-9a-f]{64}$/.test(m.conditionId) &&
				Date.parse(m.endDate) > now + 48 * 3600e3 &&
				Date.parse(m.endDate) <= Date.parse(max) &&
				yes(m) >= 0.04 &&
				yes(m) <= 0.96 &&
				Number(m.volume) >= 100_000 &&
				!SKIP.test(m.question),
		)
		.sort((a, b) => Number(b.volume) - Number(a.volume))
		.slice(0, 2);
	const room = 3 - (perCategory.get(cat) ?? 0);
	const take = ok.slice(0, Math.min(room, PINNED.length + COUNT - picked.length));
	if (!take.length) continue;
	perCategory.set(cat, (perCategory.get(cat) ?? 0) + take.length);
	const grouped = markets.length > 1 && take.length > 1;
	for (const m of take) {
		const closeHeight = heightAt(Date.parse(m.endDate) - 24 * 3600e3);
		picked.push({
			id: idOf(m.conditionId),
			slug: m.slug,
			closeHeight,
			m,
			category: cat,
			image: m.image || e.image,
			event: grouped
				? { id: e.slug, title: e.title, outcome: m.groupItemTitle || undefined }
				: undefined,
		});
	}
}
const ids = picked.map((p) => p.id);
if (new Set(ids).size !== ids.length) throw new Error(`id collision: ${ids}`);

mkdirSync(IMAGES, { recursive: true });
const toml = [];
const mock = [];
for (const p of picked) {
	const { m } = p;
	const file = await image(p.image ?? m.image, p.id);
	const rule = rules(m, p.closeHeight);
	const event = p.event
		? `\nevent = { id = ${JSON.stringify(p.event.id)}, title = ${JSON.stringify(p.event.title)}${p.event.outcome ? `, outcome = ${JSON.stringify(p.event.outcome)}` : ""} }`
		: "";
	toml.push(`[[markets]]
id = ${p.id}
question = ${JSON.stringify(m.question)}
plugin = "polymarket"
params = { conditionId = "${m.conditionId}", slug = "${m.slug}" }
closeHeight = ${p.closeHeight}
resolveHeight = ${p.closeHeight}
status = "open"
category = "${p.category}"${event}
rules = ${JSON.stringify(rule)}
`);
	mock.push({
		id: p.id,
		question: m.question,
		conditionId: m.conditionId,
		slug: m.slug,
		closeHeight: p.closeHeight,
		category: p.category,
		...(p.event && { event: p.event }),
		rules: rule,
		price: Math.round(yes(m) * 1000) / 10,
		image: file,
	});
	console.log(`${p.id}\t${p.category}\t${(yes(m) * 100).toFixed(1)}%\t${m.question}`);
}

const BEGIN = "# BEGIN polymarket-catalog";
const END = "# END polymarket-catalog";
const text = readFileSync(TOML, "utf8");
const [head, rest] = text.split(`${BEGIN}\n`);
const tail = rest?.split(`${END}\n`)[1];
if (tail === undefined) throw new Error(`${TOML}: no ${BEGIN} / ${END} markers`);
const note = `# Generated by scripts/polymarket-catalog.mjs on ${new Date(now).toISOString().slice(0, 10)}; re-run it, don't edit by hand.\n\n`;
writeFileSync(TOML, `${head}${BEGIN}\n${note}${toml.join("\n")}${END}\n${tail}`);
writeFileSync(MOCK, `${JSON.stringify(mock, null, "\t")}\n`);
console.log(`${picked.length} mirrored markets (${PINNED.length} pinned)`);
