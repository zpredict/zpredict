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

/** Fixed deposit denominations in units, so a deposit never reveals a bet size. */
export const DENOMINATIONS = [1, 5, 25] as const;

/** Placeholder until the FROST DKG publishes the escrow's Ironwood-only unified address. */
export const ESCROW_UA_PLACEHOLDER = "utest1…escrow-address-published-after-dkg";

export const POLL_MS = { balance: 2500, fills: 1500, view: 900, health: 4000, markets: 10000 };
