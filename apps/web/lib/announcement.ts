/**
 * The bar above the header. Change `id` with the text so a dismissed old one does not hide
 * the new one; `null` shows none. `href` is a plain link (a full page load), so a route with
 * its own CSP, such as /faucet/, gets it.
 */
export interface Announcement {
	id: string;
	text: string;
	link?: { href: string; label: string };
}

export const ANNOUNCEMENT: Announcement | null = {
	id: "zecathon-testnet-2026-10",
	text: "ZECATHON demo on Zcash testnet: real shielded deposits, no real value.",
	link: { href: "/faucet/", label: "Get 0.05 testnet ZEC" },
};
