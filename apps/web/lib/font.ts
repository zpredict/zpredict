import localFont from "next/font/local";

/** JetBrains Mono 500, latin subset: the app's only face. Self-hosted and preloaded by next/font. */
export const mono = localFont({
	src: "../node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2",
	weight: "500",
	display: "swap",
	variable: "--font-jbm",
	fallback: ["ui-monospace", "monospace"],
});
