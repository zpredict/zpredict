export const site = {
	title: "zPredict · Price public. Participants private.",
	description:
		"The first shielded prediction market on Zcash. Nobody learns that you bet, which side, or how much.",
	appUrl: import.meta.env.PUBLIC_APP_URL ?? "https://app.zpredict.site",
	repoUrl: "https://github.com/zpredict/zpredict",
	ogImage: "/media/og.jpg",
} as const;

export interface NavLink {
	label: string;
	href: string;
}

export const navLinks: NavLink[] = [
	{ label: "Markets", href: "#markets" },
	{ label: "Why private", href: "#why" },
	{ label: "How it works", href: "#how" },
	{ label: "Threat model", href: "#threat-model" },
];
