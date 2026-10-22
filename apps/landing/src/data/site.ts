export const site = {
	title: "zPredict · Price public. Participants private.",
	description:
		"The first shielded prediction market on Zcash. Nobody learns that you bet, which side, or how much.",
	appUrl: import.meta.env.PUBLIC_APP_URL ?? "https://app.zpredict.site",
	repoUrl: "https://github.com/zpredict/zpredict",
	ogImage: "/media/og.jpg",
	cta: "Open the app",
} as const;

export interface NavLink {
	label: string;
	href: string;
}

export const navLinks: NavLink[] = [
	{ label: "Markets", href: "#markets" },
	{ label: "Why private", href: "#why" },
	{ label: "How it works", href: "#how" },
	{ label: "Relayer view", href: "#relayer-view" },
	{ label: "Threat model", href: "#threat-model" },
	{ label: "Questions", href: "#faq" },
];

/** Hero highlighter strips. Phones drop the last one (components/Journey.astro). */
export const heroLines = [
	"Bet on it.",
	"Nobody sees you.",
	"Price public.",
	"Participants private.",
	"Resolved from Zcash chain data.",
];

export const menuInfo = {
	label: "zPredict / Testnet",
	text: "The first shielded prediction market on Zcash. Everyone sees the odds; nobody sees who bet.",
};
