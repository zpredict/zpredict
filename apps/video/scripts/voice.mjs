// Speaks each shot's `vo` line (src/config.ts) with ElevenLabs into public/voice/<shot>.mp3 and
// writes the lengths to src/voice.json, which stretches a shot when its line runs long.
//   node --env-file=.env scripts/voice.mjs   (ELEVENLABS_API_KEY; never put the key in code)
// Each request gets the lines around it (request stitching), so the read flows across cuts.
import { execFileSync } from "node:child_process";
import { createWriteStream, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { SHOTS } from "../src/config.ts";

const VOICE = process.env.VOICE_ID || "JBFqnCBsd6RMkjVDRZzb"; // George: calm, narrative
const MODEL = process.env.MODEL_ID || "eleven_multilingual_v2";

const client = new ElevenLabsClient();
const lines = SHOTS.map((s, i) => [i, s.vo]).filter(([, vo]) => vo);
mkdirSync("public/voice", { recursive: true });
const lengths = {};
for (const [k, [i, text]] of lines.entries()) {
	const out = `public/voice/${i}.mp3`;
	const audio = await client.textToSpeech.convert(VOICE, {
		text,
		modelId: MODEL,
		previousText: lines[k - 1]?.[1],
		nextText: lines[k + 1]?.[1],
		voiceSettings: { stability: 0.55, similarityBoost: 0.75 },
	});
	const raw = `${out}.raw.mp3`;
	await pipeline(Readable.fromWeb(audio), createWriteStream(raw));
	// Trim the clip's leading and trailing silence, so the cut, not the clip, sets the pause.
	const trim = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05";
	execFileSync("ffmpeg", [
		"-v",
		"error",
		"-y",
		"-i",
		raw,
		"-af",
		`${trim},areverse,${trim},areverse`,
		out,
	]);
	rmSync(raw);
	const probe = ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out];
	lengths[i] = Number(Number(execFileSync("ffprobe", probe)).toFixed(2));
	console.log(`${i}: ${lengths[i]} s  ${text}`);
}
writeFileSync("src/voice.json", `${JSON.stringify(lengths, null, "\t")}\n`);
