import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import {
	AbsoluteFill,
	continueRender,
	delayRender,
	Easing,
	interpolate,
	OffthreadVideo,
	Sequence,
	staticFile,
	useCurrentFrame,
	useVideoConfig,
} from "remotion";
import mark from "../../../packages/brand/white/android-chrome-512x512.png";
import { type Camera, FADE, SHOTS, type Shot, TOKENS } from "./config";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const gentle = Easing.bezier(0.33, 0, 0.67, 1);

const base: CSSProperties = {
	backgroundColor: TOKENS.bg,
	color: TOKENS.text,
	fontFamily: TOKENS.font,
	fontWeight: 500,
};

/** Fades a caption in after a beat and (unless `hold`) out before the cut. */
function useFade(delay = 6, hold = false) {
	const frame = useCurrentFrame();
	const { durationInFrames } = useVideoConfig();
	const out = interpolate(frame, [durationInFrames - FADE, durationInFrames], [1, 0], clamp);
	return Math.min(interpolate(frame, [delay, delay + FADE], [0, 1], clamp), hold ? 1 : out);
}

function Footage({ clip, at, cam }: { clip: string; at: number; cam?: Camera }) {
	const frame = useCurrentFrame();
	const { durationInFrames, fps } = useVideoConfig();
	const scale = cam
		? interpolate(frame, [0, durationInFrames], [cam.from, cam.to], { ...clamp, easing: gentle })
		: 1;
	return (
		<AbsoluteFill
			style={{
				transform: `scale(${scale})`,
				transformOrigin: cam ? `${cam.x}px ${cam.y}px` : "center",
			}}
		>
			<OffthreadVideo
				muted
				src={staticFile(`footage/${clip}.mp4`)}
				trimBefore={Math.round(at * fps)}
			/>
		</AbsoluteFill>
	);
}

/** The lower band: a solid strip under the footage, so captions never sit on page text. */
function Caption({ source, text, skipped }: { source?: string; text?: string; skipped?: string }) {
	const o = useFade();
	return (
		<div
			style={{
				position: "absolute",
				left: 0,
				right: 0,
				bottom: 0,
				height: TOKENS.band,
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				padding: `0 ${TOKENS.gutter}px`,
				backgroundColor: TOKENS.bg,
				borderTop: `1px solid ${TOKENS.line}`,
			}}
		>
			<div style={{ opacity: o }}>
				{source && (
					<div
						style={{
							color: TOKENS.lime,
							fontSize: 20,
							letterSpacing: "0.08em",
							marginBottom: 10,
							textTransform: "uppercase",
						}}
					>
						{source}
					</div>
				)}
				{text && <div style={{ fontSize: 38, lineHeight: 1.25 }}>{text}</div>}
			</div>
			{skipped && (
				// Real time the cut skipped (the wait for a batch to clear), so nothing looks instant.
				<div
					style={{
						padding: "8px 16px",
						backgroundColor: TOKENS.lime,
						color: TOKENS.ink,
						fontSize: 24,
						whiteSpace: "nowrap",
					}}
				>
					{skipped} later
				</div>
			)}
		</div>
	);
}

/** Lines typed over black at a steady terminal pace; the second line in muted ink. */
function TypeLines({ lines }: { lines: string[] }) {
	const frame = useCurrentFrame();
	const perChar = 1.2;
	const gap = 12;
	let start = 8;
	return (
		<AbsoluteFill style={{ ...base, justifyContent: "center", paddingLeft: 240 }}>
			{lines.map((line, i) => {
				const shown = Math.max(0, Math.floor((frame - start) / perChar));
				const typing = shown > 0 && shown < line.length;
				const done = shown >= line.length;
				start += line.length * perChar + gap;
				const last = i === lines.length - 1;
				return (
					<div
						key={line}
						style={{
							color: i === 0 ? TOKENS.text : TOKENS.muted,
							fontSize: 60,
							lineHeight: 1.5,
							whiteSpace: "pre",
						}}
					>
						{line.slice(0, shown)}
						{(typing || (last && done)) && (
							<span style={{ backgroundColor: TOKENS.lime, color: TOKENS.lime }}>_</span>
						)}
					</div>
				);
			})}
		</AbsoluteFill>
	);
}

function EndCard() {
	const o = useFade(4, true);
	const row: CSSProperties = { fontSize: 30, color: TOKENS.muted, lineHeight: 1.6 };
	return (
		<AbsoluteFill style={{ ...base, justifyContent: "center", alignItems: "center" }}>
			<div style={{ opacity: o, display: "flex", flexDirection: "column", alignItems: "center" }}>
				<div style={{ display: "flex", alignItems: "center", gap: 28 }}>
					<img alt="" height={96} src={mark} width={96} />
					<span style={{ color: TOKENS.lime, fontSize: 104, letterSpacing: "-0.02em" }}>
						zPredict
					</span>
				</div>
				<div
					style={{
						marginTop: 44,
						padding: "4px 14px",
						backgroundColor: TOKENS.lime,
						color: TOKENS.ink,
						fontSize: 40,
					}}
				>
					Price public. Participants private.
				</div>
				<div style={{ marginTop: 56, textAlign: "center" }}>
					<div style={{ ...row, color: TOKENS.text }}>zpredict.site</div>
					<div style={row}>app.zpredict.site · docs.zpredict.site</div>
				</div>
			</div>
		</AbsoluteFill>
	);
}

function Scene({ shot }: { shot: Shot }) {
	if (shot.kind === "type") return <TypeLines lines={shot.lines} />;
	if (shot.kind === "end") return <EndCard />;
	return (
		<AbsoluteFill style={base}>
			<Footage at={shot.at} cam={shot.cam} clip={shot.clip} />
			{shot.caption && <Caption skipped={shot.skipped} source={shot.source} text={shot.caption} />}
		</AbsoluteFill>
	);
}

/** Holds the first frame until the local JetBrains Mono files are ready (no network). */
function useFonts() {
	const [handle] = useState(() => delayRender("JetBrains Mono"));
	useEffect(() => {
		Promise.all([400, 500, 700].map((w) => document.fonts.load(`${w} 40px "JetBrains Mono"`))).then(
			() => continueRender(handle),
		);
	}, [handle]);
}

export function Demo() {
	useFonts();
	const { fps } = useVideoConfig();
	let from = 0;
	return (
		<AbsoluteFill style={base}>
			{SHOTS.map((shot, i) => {
				const frames = Math.round(shot.dur * fps);
				const seq = (
					// biome-ignore lint/suspicious/noArrayIndexKey: the shot list is static
					<Sequence durationInFrames={frames} from={from} key={i}>
						<Scene shot={shot} />
					</Sequence>
				);
				from += frames;
				return seq;
			})}
		</AbsoluteFill>
	);
}
