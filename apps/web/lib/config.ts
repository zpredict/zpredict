import { RELAYERS, type Relayers } from "@zpredict/sdk";

/**
 * The three relayer origins. Baked in at build time from NEXT_PUBLIC_RELAYERS
 * ("url0,url1,url2"); defaults to the hosted testnet relayers.
 */
function parseRelayers(raw: string | undefined): Relayers {
	const urls = (raw ?? "")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	return urls.length === 3 ? [urls[0], urls[1], urls[2]] : RELAYERS;
}

export const relayers = parseRelayers(process.env.NEXT_PUBLIC_RELAYERS);

export const LANDING_URL = "https://zpredict.site";
export const DOCS_URL = "https://docs.zpredict.site";

/**
 * The escrow's Ironwood-only unified address, published by the FROST DKG and baked in at
 * build time from NEXT_PUBLIC_ESCROW_UA. Null until then: the deposit flow says so instead
 * of showing an address nobody can spend from.
 */
export const ESCROW_UA = process.env.NEXT_PUBLIC_ESCROW_UA?.trim() || null;

export const POLL_MS = {
	balance: 2500,
	fills: 1500,
	view: 900,
	health: 4000,
	markets: 10000,
	groupKey: 60000,
};
