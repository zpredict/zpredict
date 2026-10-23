// Contact sheet for reviewing a video: one frame every N seconds, tiled.
//   node scripts/video/frames.mjs <video> <sheet.jpg> [every seconds = 10] [columns = 3]
import { execFileSync } from "node:child_process";

const [video, sheet, every = "10", cols = "3"] = process.argv.slice(2);
if (!sheet) throw new Error("usage: frames.mjs <video> <sheet.jpg> [every] [cols]");
const len = Number(
	execFileSync("ffprobe", [
		"-v",
		"error",
		"-show_entries",
		"format=duration",
		"-of",
		"csv=p=0",
		video,
	]),
);
const rows = Math.ceil(Math.ceil(len / every) / cols);
execFileSync("ffmpeg", [
	"-loglevel",
	"error",
	"-y",
	"-i",
	video,
	"-vf",
	`fps=1/${every},scale=640:-1,drawtext=fontfile=/System/Library/Fonts/Menlo.ttc:text='%{pts\\:hms}':x=8:y=8:fontsize=22:fontcolor=white:box=1:boxcolor=black,tile=${cols}x${rows}`,
	"-frames:v",
	"1",
	"-q:v",
	"4",
	sheet,
]);
console.log(`${len.toFixed(1)} s -> ${sheet}`);
