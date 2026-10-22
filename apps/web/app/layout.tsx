import "@fontsource/figtree/latin-500.css";
import "@fontsource/instrument-sans/latin-400.css";
import "@fontsource/instrument-sans/latin-500.css";
import "@/styles/tokens.css";
import "@/styles/base.css";
import "@/styles/ui.css";
import "@/styles/layout.css";
import "@/styles/home.css";
import "@/styles/markets.css";
import "@/styles/trade.css";
import "@/styles/relayer-view.css";
import "@/styles/threat-model.css";
import type { Metadata, Viewport } from "next";
import Providers from "@/components/layout/Providers";
import Topbar from "@/components/layout/Topbar";

export const metadata: Metadata = {
	title: "zPredict — shielded prediction markets on Zcash",
	description:
		"Bet on an outcome without anyone learning that you bet, which side you took, or how much.",
	referrer: "no-referrer",
	// Theme-aware favicon, per packages/brand/README.md.
	icons: {
		icon: [
			{ url: "/favicon.ico", sizes: "48x48" },
			{ url: "/favicon-32x32.png", media: "(prefers-color-scheme: light)" },
			{
				url: "/white/favicon-32x32.png",
				media: "(prefers-color-scheme: dark)",
			},
		],
		apple: "/white/apple-touch-icon.png",
	},
};

export const viewport: Viewport = { themeColor: "#020202" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<body>
				<Providers>
					<div className="shell">
						<Topbar />
						{children}
					</div>
				</Providers>
			</body>
		</html>
	);
}
