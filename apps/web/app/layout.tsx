import "@zpredict/brand/tokens.css";
import "@/styles/tokens.css";
import "@/styles/base.css";
import "@/styles/ui.css";
import "@/styles/layout.css";
import "@/styles/menu.css";
import "@/styles/home.css";
import "@/styles/markets.css";
import "@/styles/trade.css";
import "@/styles/ticket.css";
import "@/styles/xor.css";
import "@/styles/relayer-view.css";
import "@/styles/threat-model.css";
import type { Metadata, Viewport } from "next";
import Providers from "@/components/layout/Providers";
import Topbar from "@/components/layout/Topbar";
import { mono } from "@/lib/font";

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

export const viewport: Viewport = { themeColor: "#050505" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html className={mono.variable} lang="en">
			<body>
				<Providers>
					<Topbar />
					{children}
				</Providers>
			</body>
		</html>
	);
}
