export const SITE_NAME = "zPredict Docs";
export const SITE_DESCRIPTION =
	"How zPredict, the shielded prediction market on Zcash, works: orders, MPC matching, the FROST escrow, privacy, the relayer API and the SDK, and what is live today.";
export const LANDING_URL = "https://zpredict.site";
export const APP_URL = "https://app.zpredict.site";
export const GITHUB_URL = "https://github.com/zpredict/zpredict";

/** Canonical origin for the sitemap, metadata and the Markdown routes. */
export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://docs.zpredict.site").replace(
	/\/$/,
	"",
);

export const canonical = (path: string) => `${siteUrl}${path.startsWith("/") ? path : `/${path}`}`;
