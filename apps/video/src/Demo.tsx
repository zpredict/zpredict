import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import {
	AbsoluteFill,
	Audio,
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
import { type Camera, FADE, SHOTS, type Shot, shotDur, TOKENS, VIDEO, VO_LEAD } from "./config";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

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

/** Source footage size (scripts/capture.mjs records at 1920x1080). */
const SRC = { w: 1920, h: 1080 };
/** Margin around the framed window when it is not zoomed. */
const MARGIN = 40;
const PUSH = 0.9;
const push = Easing.bezier(0.65, 0, 0.35, 1);

/**
 * The app in a framed window on the stage (the area above the caption band). With a camera, the
 * window eases once into the region that matters and holds there; it never drifts, and once in,
 * it always covers the stage, so no background shows at the edges.
 */
function Footage({
	clip,
	at,
	cam,
	stageH,
}: {
	clip: string;
	at: number;
	cam?: Camera;
	stageH: number;
}) {
	const frame = useCurrentFrame();
	const { fps, width } = useVideoConfig();
	const fit = Math.min((width - 2 * MARGIN) / SRC.w, (stageH - 2 * MARGIN) / SRC.h);
	const wide = { s: fit, x: (width - fit * SRC.w) / 2, y: (stageH - fit * SRC.h) / 2 };
	let view = wide;
	if (cam) {
		const s = Math.max(fit, width / cam.w);
		const pin = (t: number, span: number, src: number) =>
			span >= s * src ? (span - s * src) / 2 : Math.min(0, Math.max(span - s * src, t));
		const zoomed = {
			s,
			x: pin(width / 2 - s * cam.x, width, SRC.w),
			y: pin(stageH / 2 - s * cam.y, stageH, SRC.h),
		};
		const start = (cam.at ?? 0.4) * fps;
		const p =
			cam.at === 0
				? 1
				: interpolate(frame, [start, start + PUSH * fps], [0, 1], { ...clamp, easing: push });
		const mix = (a: number, b: number) => a + (b - a) * p;
		view = { s: mix(wide.s, zoomed.s), x: mix(wide.x, zoomed.x), y: mix(wide.y, zoomed.y) };
	}
	return (
		<div style={{ position: "absolute", inset: 0, height: stageH, overflow: "hidden" }}>
			<div
				style={{
					position: "absolute",
					width: SRC.w,
					height: SRC.h,
					transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})`,
					transformOrigin: "0 0",
					borderRadius: 14 / view.s,
					border: `${1 / view.s}px solid ${TOKENS.line}`,
					overflow: "hidden",
					boxShadow: "0 24px 80px rgba(0, 0, 0, 0.6)",
				}}
			>
				<OffthreadVideo
					muted
					src={staticFile(`footage/${clip}.mp4`)}
					trimBefore={Math.round(at * fps)}
				/>
			</div>
		</div>
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
					{skipped}
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
			<Footage
				at={shot.at}
				cam={shot.cam}
				clip={shot.clip}
				stageH={VIDEO.height - (shot.caption ? TOKENS.band : 0)}
			/>
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
				const frames = Math.round(shotDur(shot, i) * fps);
				const seq = (
					// biome-ignore lint/suspicious/noArrayIndexKey: the shot list is static
					<Sequence durationInFrames={frames} from={from} key={i}>
						<Scene shot={shot} />
						{shot.vo && (
							<Sequence from={Math.round(VO_LEAD * fps)}>
								<Audio src={staticFile(`voice/${i}.mp3`)} volume={1.6} />
							</Sequence>
						)}
					</Sequence>
				);
				from += frames;
				return seq;
			})}
		</AbsoluteFill>
	);
}
