// The whole cut in one place: format, brand tokens and the shot list. Times are seconds.
// Footage comes from scripts/capture.mjs (real headless-Chrome recordings of the live app);
// `at` is where a shot starts in its clip, from the marks capture.mjs writes to src/marks.json.

import marks from "./marks.json" with { type: "json" };
import voice from "./voice.json" with { type: "json" };

export const VIDEO = { width: 1920, height: 1080, fps: 30 } as const;

/** apps/web tokens (packages/brand/tokens.css). */
export const TOKENS = {
	bg: "#050505",
	lime: "#d2fc52",
	ink: "#080a04",
	text: "#deded6",
	muted: "#a4a69e",
	line: "#ffffff1f",
	font: '"JetBrains Mono", ui-monospace, monospace',
	gutter: 48,
	/** Height of the caption band at the bottom of every footage shot. */
	band: 156,
} as const;

/** A push-in on the region that matters, in source pixels: centre (x, y), `w` wide. The shot
 *  opens on the framed window and eases in `at` seconds into it, then holds; `at: 0` opens
 *  already in (a cut-in). */
export interface Camera {
	x: number;
	y: number;
	w: number;
	at?: number;
}

/** `vo`: the narration over the shot (scripts/voice.mjs speaks it; src/voice.json has the lengths). */
export type Shot = { vo?: string } & (
	| { kind: "type"; dur: number; lines: string[] }
	| {
			kind: "clip";
			dur: number;
			clip: string;
			at: number;
			/** Playback speed of the footage, set by `fitClips`; below 1 only. */
			rate?: number;
			cam?: Camera;
			/** Small label above the caption: where the footage comes from. */
			source?: string;
			caption?: string;
			/** Elapsed real time skipped by the cut into this shot, shown honestly. */
			skipped?: string;
	  }
	| { kind: "end"; dur: number }
);

/** Marks in each clip, seconds in, as capture.mjs recorded them: never copied by hand. The trade
 *  take is an account funded by a real testnet deposit; a take without a fill (`fill` null) drops
 *  the fill shot rather than faking it. The trade shots run back to back, so no footage repeats. */
const TRADE = marks.trade as typeof marks.trade & { fill: number | null };
const DEPOSIT = marks.deposit;
const ACCOUNT = marks.account;

/** The fill landing: each relayer's FILL row gets its share of the fill. */
const fillShot = (fill: number): Shot => ({
	kind: "clip",
	dur: 3.6,
	clip: "trade",
	at: fill,
	cam: { x: 500, y: 330, w: 980, at: 0 },
	source: "relayer view · live",
	caption: "Matched inside 3-party MPC. The fill comes back as three shares too.",
	skipped: `Filled ${Math.round(fill - TRADE.send)} s after send`,
	vo: "The fill comes back the same way, as three shares.",
});

export const SHOTS: Shot[] = [
	// A: the problem, then the product.
	{
		kind: "type",
		dur: 5.2,
		lines: ["Every bet on Polymarket is public.", "Wallets get traced to real people."],
		vo: "Every bet on Polymarket is public. Wallets get traced back to real people.",
	},
	{
		kind: "clip",
		dur: 5,
		clip: "landing",
		at: 1,
		source: "zpredict.site",
		caption: "zPredict: a prediction market on Zcash that hides who bet.",
		vo: "zPredict is a prediction market on Zcash that hides who bet.",
	},
	// B: the live markets.
	{
		kind: "clip",
		dur: 4,
		clip: "home",
		at: 0.4,
		source: "app.zpredict.site · live",
		caption: "No relayer, chain observer or counterparty learns who bet.",
		vo: "No relayer, no chain observer and no counterparty learns who you are.",
	},
	{
		kind: "clip",
		dur: 7,
		clip: "home",
		at: 3.8,
		source: "app.zpredict.site · live",
		caption: "Live markets mirrored from Polymarket. Prices public, bettors hidden.",
		vo: "The markets mirror Polymarket. Prices stay public. Bettors stay hidden.",
	},
	// C: the core workflow, one real order through the live relayers.
	{
		kind: "clip",
		dur: 5,
		clip: "deposit",
		at: DEPOSIT.type - 0.5,
		cam: { x: 860, y: 330, w: 1100, at: 0.3 },
		source: "app.zpredict.site/deposit · live",
		caption: "Deposit any amount. It is split into standard notes.",
		vo: "Deposit any amount from your own Zcash wallet. It is split into standard notes, so no amount stands out.",
	},
	{
		kind: "clip",
		dur: 5,
		clip: "deposit",
		at: DEPOSIT.qr,
		cam: { x: 780, y: 520, w: 1000, at: 0 },
		source: "zip 321 payment request",
		caption: "One request, one shielded transaction, from any testnet wallet.",
		vo: "One request, one shielded transaction.",
	},
	{
		kind: "clip",
		dur: 4.6,
		clip: "trade",
		at: TRADE.send - 4.4,
		cam: { x: 1500, y: 420, w: 1330, at: 0.4 },
		source: "order ticket",
		caption: "Pick a side, type an amount in ZEC, split & send.",
		vo: "Pick a side, enter an amount in ZEC, and send.",
	},
	{
		kind: "clip",
		dur: 6,
		clip: "trade",
		at: TRADE.shares,
		source: "relayer view · live",
		caption: "Your browser splits the order into three random shares.",
		vo: "Your browser splits the order into three random shares, one for each relayer.",
	},
	{
		kind: "clip",
		dur: 6,
		clip: "trade",
		at: TRADE.view,
		cam: { x: 750, y: 440, w: 1450, at: 0.3 },
		source: "relayer view · live",
		caption: "Relayers match orders in 3-party MPC. One share alone decodes nothing.",
		vo: "The relayers match orders inside multi-party computation. Each one sees only noise.",
	},
	...(TRADE.fill === null ? [] : [fillShot(TRADE.fill)]),
	// D: details.
	{
		kind: "clip",
		dur: 6,
		clip: "trade",
		at: TRADE.close,
		cam: { x: 1680, y: 560, w: 780, at: 0.3 },
		source: "your browser",
		caption: "Only your browser XORs the shares back into the fill.",
		vo: "Only your browser can put them back together.",
	},
	{
		kind: "clip",
		dur: 6,
		clip: "account",
		at: ACCOUNT.chart - 1,
		cam: { x: 960, y: 450, w: 1500, at: 0.4 },
		source: "your account · computed in your browser",
		caption: "Portfolio and P&L, computed only in your browser.",
		vo: "Your portfolio and profit and loss are computed only in your browser. The relayers never see them.",
	},
	{
		kind: "clip",
		dur: 5.5,
		clip: "resolved",
		at: 0.5,
		cam: { x: 450, y: 470, w: 900, at: 0.3 },
		source: "hourly market · resolved",
		caption: "Outcomes from Zcash blocks, signed 2-of-3, checked in your browser.",
		vo: "Outcomes are signed by two of three relayers, and your browser checks the signature.",
	},
	{
		kind: "clip",
		dur: 6,
		clip: "threat",
		at: 0.5,
		cam: { x: 1050, y: 600, w: 1100, at: 0.6 },
		source: "app.zpredict.site/threat-model",
		caption: "Who learns what, including the demo's limit: one VM, three relayers.",
		vo: "Here is exactly who learns what, including today's limit: one server runs all three relayers.",
	},
	{
		kind: "clip",
		dur: 6,
		clip: "evidence",
		at: 0.5,
		cam: { x: 960, y: 540, w: 1500, at: 0.6 },
		source: "docs.zpredict.site · evidence",
		caption: "On Zcash testnet: deposit, fill, signed outcome, 2-of-3 payout.",
		vo: "And it works end to end on Zcash testnet: deposit, fill, signed outcome, and payout.",
	},
	// E: resolution.
	{ kind: "clip", dur: 2.5, clip: "home", at: 0.2 },
	{ kind: "end", dur: 5, vo: "zPredict. Price public. Participants private." },
];

/** Narration starts this long into a shot, and the shot cuts this long after it ends: with the
 *  clips trimmed of silence, about half a second between lines, so the read flows. */
export const VO_LEAD = 0.15;
const VO_TAIL = 0.4;
/** Shortest a narrated shot can be, so a quick line still leaves the picture time to read. */
const MIN_SHOT = 3.2;

/** voice/<i>.mp3 per narrated shot: the text it speaks and its length (scripts/voice.mjs). */
const VOICE = voice as Record<string, { text: string; s: number }>;

/** A narrated shot lasts as long as its line; a silent one keeps its own `dur`. */
export const shotDur = (shot: Shot, i: number) =>
	shot.vo ? Math.max(MIN_SHOT, VO_LEAD + VOICE[i].s + VO_TAIL) : shot.dur;

/** Seconds of footage a shot plays. */
const used = (shot: Shot, i: number) =>
	shot.kind === "clip" ? shotDur(shot, i) * (shot.rate ?? 1) : 0;

/**
 * Back-to-back shots from one clip never replay footage: when a narrated shot would run into the
 * next one's start (the fill landing before its own shot, say), its mostly still footage plays
 * a little slower so it ends where the next shot begins.
 */
SHOTS.forEach((shot, i) => {
	const next = SHOTS[i + 1];
	if (shot.kind !== "clip" || next?.kind !== "clip" || next.clip !== shot.clip) return;
	const room = next.at - shot.at;
	if (room > 0 && room < used(shot, i)) shot.rate = room / shotDur(shot, i);
});

/**
 * Everything that would put the wrong voice or picture in the cut: a narrated shot whose
 * voice file speaks another line (or none), a voice file no shot uses, a shot that runs past
 * the end of its clip, footage replayed by the next shot or slowed below 0.6x, or a trade take
 * without a fill. Root throws on any of them.
 */
export function cutProblems(): string[] {
	const out = SHOTS.flatMap((shot, i) => [...voiceProblems(shot, i), ...clipProblems(shot, i)]);
	for (const k of Object.keys(VOICE))
		if (!SHOTS[Number(k)]?.vo) out.push(`voice/${k}.mp3 belongs to no narrated shot`);
	if (TRADE.fill === null) out.push("trade take has no fill: capture it again");
	return out;
}

const voiceProblems = (shot: Shot, i: number) =>
	shot.vo && VOICE[i]?.text !== shot.vo
		? [
				`shot ${i}: voice/${i}.mp3 says "${VOICE[i]?.text}", not "${shot.vo}" (run scripts/voice.mjs)`,
			]
		: [];

function clipProblems(shot: Shot, i: number): string[] {
	if (shot.kind !== "clip") return [];
	const out: string[] = [];
	const end = shot.at + used(shot, i);
	const next = SHOTS[i + 1];
	if (next?.kind === "clip" && next.clip === shot.clip && end > next.at + 0.01)
		out.push(`shot ${i}: ${shot.clip} runs to ${end.toFixed(2)} s, past shot ${i + 1}'s start`);
	if ((shot.rate ?? 1) < 0.6) out.push(`shot ${i}: footage slowed to ${shot.rate?.toFixed(2)}x`);
	const len = (marks as Record<string, { length: number }>)[shot.clip]?.length;
	if (!(shot.at >= 0 && len && end <= len))
		out.push(`shot ${i}: ${shot.clip} ${shot.at.toFixed(2)}-${end.toFixed(2)} s, clip is ${len} s`);
	return out;
}

/** Frames a caption takes to fade in or out. */
export const FADE = 8;
