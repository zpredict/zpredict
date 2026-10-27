// The whole cut in one place: format, brand tokens and the shot list. Times are seconds.
// Footage comes from scripts/capture.mjs (real headless-Chrome recordings of the live app);
// `at` is where a shot starts in its clip, taken from the marks in public/footage/shots.json.

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
			cam?: Camera;
			/** Small label above the caption: where the footage comes from. */
			source?: string;
			caption?: string;
			/** Elapsed real time skipped by the cut into this shot, shown honestly. */
			skipped?: string;
	  }
	| { kind: "end"; dur: number }
);

/** Marks in trade.mp4 (public/footage/shots.json, "trade"), seconds into the clip; null `fill`
 *  when a take has no fill, and then the fill shot is left out rather than faked. This take is an
 *  account funded by a real testnet deposit; the order filled 9 s after "Split & send". The
 *  shots run back to back through the clip, so no footage repeats. */
const TRADE: Record<"start" | "send" | "shares" | "view" | "close", number> & {
	fill: number | null;
} = { start: 1.5, send: 9.56, shares: 9.8, view: 15.4, fill: 22.4, close: 26.04 };

/** The fill landing: each relayer's FILL row gets its share of the fill. */
const fillShot = (fill: number): Shot => ({
	kind: "clip",
	dur: 3.6,
	clip: "trade",
	at: fill,
	cam: { x: 500, y: 330, w: 980, at: 0 },
	source: "relayer view · live",
	caption: "Matched inside 3-party MPC. The fill comes back as three shares too.",
	skipped: "Filled 9 s after send",
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
		dur: 4.2,
		clip: "trade",
		at: TRADE.start - 0.7,
		source: "account funded by a real testnet deposit",
		caption: "A real testnet deposit funds the account. No mock balances.",
		vo: "Your account is funded by a real testnet deposit from our faucet. No mock balances.",
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
		caption: "Only your browser XORs the shares back: filled 1 YES share at 92¢.",
		vo: "Only your browser can put them back together: one YES share, at ninety-two cents.",
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
	{ kind: "clip", dur: 3.5, clip: "home", at: 0.2 },
	{ kind: "end", dur: 5, vo: "zPredict. Price public. Participants private." },
];

/** Narration starts this long into a shot and the shot runs at least this long after it. */
export const VO_LEAD = 0.25;
const VO_TAIL = 0.6;

/** A shot's length: its own `dur`, stretched when its narration needs longer. */
export const shotDur = (shot: Shot, i: number) =>
	Math.max(shot.dur, VO_LEAD + ((voice as Record<string, number>)[i] ?? 0) + VO_TAIL);

/** Frames a caption takes to fade in or out. */
export const FADE = 8;
