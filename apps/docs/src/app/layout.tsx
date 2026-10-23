import "@zpredict/brand/tokens.css";
import "./global.css";

import { RootProvider } from "fumadocs-ui/provider/next";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { connection } from "next/server";
import type { ReactNode } from "react";

import { SiteHeader } from "@/components/site-header";
import { SITE_DESCRIPTION, SITE_NAME, siteUrl } from "@/lib/site";

/** JetBrains Mono 500, latin subset: the only face. Self-hosted and preloaded by next/font. */
const mono = localFont({
	src: "../../node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2",
	weight: "500",
	display: "swap",
	variable: "--font-jbm",
	fallback: ["ui-monospace", "monospace"],
});

export const metadata: Metadata = {
	metadataBase: new URL(siteUrl),
	title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
	description: SITE_DESCRIPTION,
	applicationName: SITE_NAME,
	referrer: "no-referrer",
	manifest: "/white/site.webmanifest",
	// Theme-aware favicon, per packages/brand/README.md.
	icons: {
		icon: [
			{ url: "/favicon.ico", sizes: "48x48" },
			{ url: "/favicon-32x32.png", media: "(prefers-color-scheme: light)" },
			{ url: "/white/favicon-32x32.png", media: "(prefers-color-scheme: dark)" },
		],
		apple: "/white/apple-touch-icon.png",
	},
	openGraph: {
		type: "website",
		siteName: SITE_NAME,
		url: siteUrl,
		title: SITE_NAME,
		description: SITE_DESCRIPTION,
		images: [{ url: "/og", width: 1200, height: 630, alt: "zPredict" }],
	},
	twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = { themeColor: "#050505", colorScheme: "dark" };

const RootLayout = async ({ children }: { children: ReactNode }) => {
	// Render per request, so Next can put this request's CSP nonce on its scripts (src/proxy.ts).
	await connection();
	return (
		<html className={`dark ${mono.variable}`} lang="en" suppressHydrationWarning>
			<body className="flex min-h-screen flex-col">
				<RootProvider theme={{ enabled: false }}>
					<SiteHeader />
					{children}
				</RootProvider>
			</body>
		</html>
	);
};

export default RootLayout;
