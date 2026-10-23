import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "takumi-js/response";

// Social cards, rendered at build from local files only: the self-hosted JetBrains Mono and
// the white mark from packages/brand (copied to public/ by scripts/brand.mjs).
const root = process.cwd();
const font = () =>
	readFile(
		join(
			root,
			"node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2",
		),
	);
const mark = async () =>
	`data:image/png;base64,${(await readFile(join(root, "public/white/android-chrome-192x192.png"))).toString("base64")}`;

export const ogImage = async (title: string, description?: string) => {
	const [data, logo] = await Promise.all([font(), mark()]);
	return new ImageResponse(
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				width: "100%",
				height: "100%",
				backgroundColor: "#050505",
				color: "#deded6",
				padding: "64px 72px",
				fontFamily: "JetBrains Mono",
			}}
		>
			<div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
				{/* biome-ignore lint/performance/noImgElement: rendered by takumi, not the browser */}
				<img alt="" height={48} src={logo} width={48} />
				<span style={{ fontSize: "30px", color: "#d2fc52" }}>zPredict docs</span>
			</div>
			<div style={{ display: "flex", flex: 1 }} />
			<div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "1000px" }}>
				<span style={{ fontSize: "68px", lineHeight: 1.1, color: "#f3f3ed" }}>{title}</span>
				{description ? (
					<span style={{ fontSize: "28px", lineHeight: 1.4, color: "#a4a69e" }}>{description}</span>
				) : null}
			</div>
			<div
				style={{ display: "flex", height: "12px", marginTop: "48px", backgroundColor: "#d2fc52" }}
			/>
		</div>,
		{
			width: 1200,
			height: 630,
			format: "webp",
			fonts: [{ name: "JetBrains Mono", data, weight: 500, style: "normal" }],
		},
	);
};
