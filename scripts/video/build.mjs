// Edits the pitch video from the shots (shots.mjs) and a macOS `say` voiceover.
//   node scripts/video/build.mjs <shots dir> <out.mp4> [poster.jpg]
// Every line below is spoken and burned in as a caption (JetBrains Mono, lime strip).
// VOICE (default Samantha) and RATE (words per minute) pick the draft voice.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const [dir, out, poster] = process.argv.slice(2);
if (!out) throw new Error("usage: build.mjs <shots dir> <out.mp4> [poster.jpg]");
const VOICE = process.env.VOICE || "Samantha";
const RATE = process.env.RATE || "180";
const font = (w) =>
	createRequire(new URL("../../apps/landing/package.json", import.meta.url)).resolve(
		`@fontsource/jetbrains-mono/files/jetbrains-mono-latin-${w}-normal.woff`,
	);
const app = JSON.parse(readFileSync(join(dir, "shots.json"), "utf8")).app;
const work = join(dir, "build");
mkdirSync(work, { recursive: true });

// clip: shot file; right: captions over the Relayer View pane; from/to: seconds into it; speed: time-lapse factor; label: top-left strip.
// `at` pins a line to a time in the segment (else it follows the previous line).
const lapse = 6;
const SEGMENTS = [
	{
		clip: "title",
		lines: ["On today's prediction markets, every bet is public.", "And people get found."],
	},
	{
		clip: "landing",
		min: 12,
		lines: [
			"zPredict is a prediction market on Zcash.",
			"The first where nobody can see that you bet: not who, not which side, not how much.",
		],
	},
	{
		clip: "app",
		right: true,
		to: app.sent + 5,
		lines: [
			"Judge mode gives you a demo account. No wallet needed.",
			{ at: 7.2, text: "The market: will NU7 activate at this block?" },
			{
				at: Math.max(0, app.sent - 1.5),
				text: "Buy YES. Your browser splits the order into three random shares, one per relayer.",
			},
		],
	},
	{
		clip: "app",
		right: true,
		from: app.sent + 5,
		to: app.fill - 2,
		speed: lapse,
		full: true,
		label: `time-lapse x${lapse} · a second trader buys NO in another browser`,
		lines: [
			"Three relayers match orders inside multi-party computation.",
			"None of them knows what you bet. Your shares are lit; the rest is noise.",
		],
	},
	{
		clip: "app",
		right: true,
		from: app.fill - 2,
		full: true,
		lines: [{ at: 2.3, text: "Then the fill, at the midpoint." }, "Only your browser can open it."],
	},
	{
		clip: "resolved",
		label: "live market · outcome not yet FROST-signed in production",
		lines: [
			"Markets resolve from Zcash chain data.",
			"This block decided the outcome. Anyone can check it.",
		],
	},
	{
		clip: "terminal",
		full: true,
		label: "regtest · real output of scripts/relayer-e2e.sh",
		lines: [
			"Settlement, on our regtest chain.",
			{
				at: 4.5,
				text: "Each relayer tried to forge the winner's withdrawal. All three were refused.",
			},
			"The real payout: one Ironwood transaction to a fresh shielded address.",
			"On chain: nothing readable. Zero transparent inputs or outputs.",
		],
	},
	{
		clip: "threat",
		min: 13,
		lines: [
			"Here is exactly what each party can and can't learn.",
			"Including what's still open: today's demo runs on one server, behind Cloudflare.",
			"Price public. Participants private.",
		],
	},
	{ clip: "end", min: 6, lines: ["zPredict. Bet on Zcash, without being seen."] },
];

const run = (cmd, args) => execFileSync(cmd, args, { stdio: ["ignore", "pipe", "inherit"] });
const duration = (f) =>
	Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]));
/** Greedy word wrap for the caption strip. */
const wrap = (s, n = 52) =>
	s.split(" ").reduce((ls, w) => {
		const last = ls.at(-1);
		if (last && `${last} ${w}`.length <= n) ls[ls.length - 1] = `${last} ${w}`;
		else ls.push(w);
		return ls;
	}, []);

const audio = []; // [file, start seconds in the whole video]
const parts = [];
const cues = []; // for the PR comment: start, segment, text
let t0 = 0;
let n = 0;
for (const [i, seg] of SEGMENTS.entries()) {
	let t = 0.4;
	const caps = [];
	for (const l of seg.lines) {
		const { at, text } = typeof l === "string" ? { text: l } : l;
		const f = join(work, `vo${n++}.aiff`);
		run("say", ["-v", VOICE, "-r", RATE, "-o", f, text]);
		const d = duration(f);
		const start = Math.max(t, at ?? 0);
		audio.push([f, t0 + start]);
		caps.push({ text, start, end: start + d + 0.25 });
		cues.push(`${(t0 + start).toFixed(1)}s ${seg.clip}: ${text}`);
		t = start + d + 0.45;
	}
	const from = seg.from ?? 0;
	const speed = seg.speed ?? 1;
	// A segment lasts as long as its lines, or its whole clip (`full`), or `min` seconds.
	const clipLen = ((seg.to ?? duration(join(dir, `${seg.clip}.mp4`))) - from) / speed;
	const len = +Math.max(t + 0.5, seg.full ? clipLen : 0, seg.min ?? 0).toFixed(2);
	const filters = [
		`trim=start=${from}${seg.to ? `:end=${seg.to}` : ""}`,
		`setpts=(PTS-STARTPTS)/${speed}`,
		"fps=30",
		"tpad=stop_mode=clone:stop_duration=60",
		`trim=duration=${len}`,
	];
	const draw = (file, size, x, y, enable, w = 700) =>
		`drawtext=fontfile=${font(w)}:textfile=${file}:expansion=none:fontsize=${size}:fontcolor=0x080a04:box=1:boxcolor=0xD2FC52:boxborderw=14|18:x=${x}:y=${y}${enable ? `:enable='${enable}'` : ""}`;
	if (seg.label) {
		const f = join(work, `label${i}.txt`);
		writeFileSync(f, seg.label.toUpperCase());
		filters.push(draw(f, 24, 48, "h-64", "", 400));
	}
	for (const [k, c] of caps.entries()) {
		const lines = wrap(c.text, seg.right ? 36 : 52);
		for (const [j, line] of lines.entries()) {
			const f = join(work, `cap${i}_${k}_${j}.txt`);
			writeFileSync(f, line);
			const y = `h-${150 + 76 * (lines.length - 1 - j)}-${seg.label ? 70 : 0}`;
			filters.push(
				draw(f, 44, seg.right ? "1342-tw/2" : "(w-tw)/2", y, `between(t,${c.start},${c.end})`),
			);
		}
	}
	const part = join(work, `part${i}.mp4`);
	run("ffmpeg", [
		"-loglevel",
		"error",
		"-y",
		"-i",
		join(dir, `${seg.clip}.mp4`),
		"-an",
		"-vf",
		filters.join(","),
		"-c:v",
		"libx264",
		"-preset",
		"medium",
		"-crf",
		"18",
		"-pix_fmt",
		"yuv420p",
		part,
	]);
	parts.push(part);
	t0 += len;
}

const list = join(work, "parts.txt");
writeFileSync(list, parts.map((p) => `file '${p}'`).join("\n"));
const mix = audio.map(
	(_, k) => `[${k + 1}:a]adelay=${Math.round(audio[k][1] * 1000)}:all=1[a${k}]`,
);
run("ffmpeg", [
	"-loglevel",
	"error",
	"-y",
	"-f",
	"concat",
	"-safe",
	"0",
	"-i",
	list,
	...audio.flatMap(([f]) => ["-i", f]),
	"-filter_complex",
	`[0:v]fade=in:d=0.6,fade=out:st=${(t0 - 0.8).toFixed(2)}:d=0.8[v];${mix.join(";")};${audio.map((_, k) => `[a${k}]`).join("")}amix=inputs=${audio.length}:normalize=0,apad,atrim=0:${t0.toFixed(2)},loudnorm=I=-16:TP=-1.5[a]`,
	"-map",
	"[v]",
	"-map",
	"[a]",
	"-c:v",
	"libx264",
	"-preset",
	"slow",
	"-crf",
	"23",
	"-r",
	"30",
	"-pix_fmt",
	"yuv420p",
	"-c:a",
	"aac",
	"-b:a",
	"128k",
	"-ar",
	"48000",
	"-movflags",
	"+faststart",
	out,
]);
if (poster) {
	// The split screen with your shares lit, without captions.
	run("ffmpeg", [
		"-loglevel",
		"error",
		"-y",
		"-ss",
		String(app.sent + 8),
		"-i",
		join(dir, "app.mp4"),
		"-frames:v",
		"1",
		"-q:v",
		"4",
		poster,
	]);
}
writeFileSync(join(work, "cues.txt"), cues.join("\n"));
console.log(cues.join("\n"));
console.log(`${t0.toFixed(1)} s -> ${out}`);
