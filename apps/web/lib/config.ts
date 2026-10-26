import { RELAYERS, type Relayers } from "@zpredict/sdk";

function parseRelayers(raw: string | undefined): Relayers | null {
	const urls = (raw ?? "")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	return urls.length === 3 ? [urls[0], urls[1], urls[2]] : null;
}

/**
 * The three relayer origins, baked in at build time. NEXT_PUBLIC_RELAYERS ("url0,url1,url2")
 * defaults to the hosted testnet relayers. NEXT_PUBLIC_RELAYERS_ONION (same shape, optional)
 * takes over when the app itself is opened from a `.onion` host, e.g. in Tor Browser, so
 * relayer requests stay inside Tor and skip any TLS proxy (#90).
 */
export function pickRelayers(clear: string | undefined, onion: string | undefined, host: string) {
	return (host.endsWith(".onion") && parseRelayers(onion)) || parseRelayers(clear) || RELAYERS;
}

export const relayers = pickRelayers(
	process.env.NEXT_PUBLIC_RELAYERS,
	process.env.NEXT_PUBLIC_RELAYERS_ONION,
	typeof location === "undefined" ? "" : location.hostname,
);

export const LANDING_URL = "https://zpredict.site";
export const DOCS_URL = "https://docs.zpredict.site";

/**
 * The escrow's Ironwood-only unified address, published by the FROST DKG and baked in at
 * build time from NEXT_PUBLIC_ESCROW_UA. Null until then: the deposit flow says so instead
 * of showing an address nobody can spend from.
 */
export const ESCROW_UA = process.env.NEXT_PUBLIC_ESCROW_UA?.trim() || null;

/** The testnet faucet's API origin (apps/faucet), baked in from NEXT_PUBLIC_FAUCET. */
export const FAUCET_URL = process.env.NEXT_PUBLIC_FAUCET?.trim() || "https://faucet.zpredict.site";

/** Cloudflare Turnstile site key (public) for the faucet; null = the faucet doesn't ask. */
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null;

/** Base intervals; every wait is jittered (`jitter`). */
export const POLL_MS = {
	faucet: 8000,
	/** Only while a deposit or faucet drop is awaited (#90). */
	balance: 2500,
	/** One balance read about this long after a batch this browser had an order in (#90). */
	afterBatch: 20000,
	fills: 1500,
	view: 900,
	health: 4000,
	markets: 10000,
	/** The relayers refresh ZEC/USD every 5 min. */
	price: 300000,
	groupKey: 60000,
};

/**
 * `ms` ±50%, at random: keeps a browser's balance, fill and view requests from forming a
 * fixed rhythm a relayer could use to tie them to one another.
 */
export const jitter = (ms: number) => ms * (0.5 + Math.random());
