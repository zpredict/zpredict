// The whole cut in one place: format, brand tokens and the shot list. Times are seconds.
// Footage comes from scripts/capture.mjs (real headless-Chrome recordings of the live app);
// `at` is where a shot starts in its clip, taken from the marks in public/footage/shots.json.

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

/** A slow push from `from` to `to` scale, anchored on a focal point in source pixels. */
export interface Camera {
	x: number;
	y: number;
	from: number;
	to: number;
}

export type Shot =
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
	| { kind: "end"; dur: number };

/** Marks in trade.mp4 (public/footage/shots.json, "trade"), seconds into the clip. `fill` is
 *  null when the take has no fill (the relayers' batches were stalled): the fill shot is left out
 *  rather than faked. */
const TRADE: Record<"judge" | "send" | "shares" | "view" | "close", number> & {
	fill: number | null;
} = { judge: 1.5, send: 9.03, shares: 9.99, view: 14.49, fill: null, close: 47.64 };

/** The fill landing, with the real seconds the cut skipped since Split & send. */
const fillShot = (fill: number): Shot => ({
	kind: "clip",
	dur: 5.5,
	clip: "trade",
	at: fill - 0.6,
	source: "your browser",
	caption: "Matched inside 3-party MPC. Only your browser can open the fill.",
	skipped: `+${Math.round(fill - TRADE.send)} s`,
});

export const SHOTS: Shot[] = [
	// A: the problem, then the product.
	{
		kind: "type",
		dur: 5.2,
		lines: ["Every bet on Polymarket is public.", "Wallets get traced to real people."],
	},
	{
		kind: "clip",
		dur: 5,
		clip: "landing",
		at: 1,
		cam: { x: 960, y: 560, from: 1, to: 1.04 },
		source: "zpredict.site",
		caption: "zPredict: a prediction market on Zcash that hides who bet.",
	},
	// B: the live markets.
	{
		kind: "clip",
		dur: 4,
		clip: "home",
		at: 0.4,
		cam: { x: 1570, y: 250, from: 1, to: 1.05 },
		source: "app.zpredict.site · live",
		caption: "No relayer, chain observer or counterparty learns who bet.",
	},
	{
		kind: "clip",
		dur: 7,
		clip: "home",
		at: 3.8,
		source: "app.zpredict.site · live",
		caption: "Live markets mirrored from Polymarket. Prices public, bettors hidden.",
	},
	// C: the core workflow, one real order through the live relayers.
	{
		kind: "clip",
		dur: 4.2,
		clip: "trade",
		at: TRADE.judge - 0.7,
		source: "judge mode · mock collateral",
		caption: "Judge mode: a demo account with mock collateral. No wallet.",
	},
	{
		kind: "clip",
		dur: 4.6,
		clip: "trade",
		at: TRADE.send - 4.4,
		cam: { x: 1680, y: 420, from: 1, to: 1.12 },
		source: "order ticket",
		caption: "Pick a side, type an amount in ZEC, split & send.",
	},
	{
		kind: "clip",
		dur: 6,
		clip: "trade",
		at: TRADE.shares - 0.2,
		source: "relayer view · live",
		caption: "Your browser splits the order into three random shares.",
	},
	{
		kind: "clip",
		dur: 6,
		clip: "trade",
		at: TRADE.view + 0.5,
		cam: { x: 750, y: 380, from: 1.04, to: 1.14 },
		source: "relayer view · live",
		caption: "Relayers match orders in 3-party MPC. One share alone decodes nothing.",
	},
	...(TRADE.fill === null ? [] : [fillShot(TRADE.fill)]),
	// D: details.
	{
		kind: "clip",
		dur: 6,
		clip: "trade",
		at: TRADE.close,
		cam: { x: 1880, y: 540, from: 1.1, to: 1.3 },
		source: "your browser",
		caption: "Only your browser XORs them back: market 11 · YES · 92¢ · 10 contracts.",
	},
	{
		kind: "clip",
		dur: 5.5,
		clip: "resolved",
		at: 0.5,
		cam: { x: 48, y: 525, from: 1.15, to: 1.35 },
		source: "hourly market · resolved",
		caption: "Outcomes from Zcash blocks, signed 2-of-3, checked in your browser.",
	},
	{
		kind: "clip",
		dur: 6,
		clip: "threat",
		at: 0.5,
		cam: { x: 1340, y: 520, from: 1, to: 1.05 },
		source: "app.zpredict.site/threat-model",
		caption: "Who learns what, including the demo's limit: one VM, three relayers.",
	},
	{
		kind: "clip",
		dur: 6,
		clip: "evidence",
		at: 0.5,
		cam: { x: 960, y: 500, from: 1, to: 1.05 },
		source: "docs.zpredict.site · evidence",
		caption: "On Zcash testnet: deposit, fill, signed outcome, 2-of-3 payout.",
	},
	// E: resolution.
	{ kind: "clip", dur: 3.5, clip: "home", at: 0.2, cam: { x: 960, y: 400, from: 1.05, to: 1 } },
	{ kind: "end", dur: 5 },
];

/** Frames a caption takes to fade in or out. */
export const FADE = 8;
