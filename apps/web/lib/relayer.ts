// Thin wrapper over @zpredict/sdk bound to the configured relayers.
// Each relayer only ever receives its own share; requests carry no cookies and no referrer.
import {
	claimJudge as claim,
	getAccount,
	getFill,
	getGroupKey,
	getMemoKeys,
	getView,
	getWithdrawal,
	type Health,
	type Market,
	type Side,
	submitOrder,
	submitWithCounterparty,
	submitWithdrawal,
} from "@zpredict/sdk";
import { relayers } from "./config";

async function json<T>(url: string, init?: RequestInit): Promise<T> {
	const r = await fetch(url, {
		...init,
		credentials: "omit",
		referrerPolicy: "no-referrer",
	});
	if (!r.ok) throw new Error(`${r.status} from ${url}`);
	return r.json() as Promise<T>;
}

const at = (base: string, path: string) => base.replace(/\/+$/, "") + path;

export const fetchHealth = (i: number) => json<Health>(at(relayers[i], "/health"));

export const fetchMarkets = () => json<Market[]>(at(relayers[0], "/markets"));

/** Mock, testnet only: opens account `tag` with demo balance; relayer i gets only its share. */
export const claimJudge = (tag: string) => claim(relayers, tag);

/** Balance and seat (whether the account's orders can fill: see `Seat`). */
export const fetchAccount = (tag: string) => getAccount(relayers, tag);

/** Relayer i answers only to `tokens[i]`, the read token this browser gave it with the order. */
export const fetchFill = (orderId: string, tokens: readonly string[]) =>
	getFill(relayers, orderId, tokens);

export const fetchView = (i: number, after: number) => getView(relayers[i], after);

/** The FROST group key, if all three relayers serve the same one (signing is live). */
export const fetchGroupKey = () => getGroupKey(relayers).catch(() => null);

/** Each relayer's deposit-memo public key, fetched from that relayer only. */
export const fetchMemoKeys = () => getMemoKeys(relayers);

export interface OrderInput {
	market: number;
	side: Side;
	price: number;
	size: number;
}

/** Encodes (the tag is the order's key), splits and sends share i to relayer i only. */
export const placeOrder = (o: OrderInput, tag: string) => submitOrder(relayers, { ...o, key: tag });

/** DEMO (#103): `o` plus its exact opposite from the same account, so they cross (a self-trade). */
export const placeWithCounterparty = (o: OrderInput, tag: string) =>
	submitWithCounterparty(relayers, { ...o, key: tag });

/** Sends relayer i only a fresh share of the tag; amount (half-ticks) and address are public. */
export const withdraw = (tag: string, halfTicks: bigint, address: string) =>
	submitWithdrawal(relayers, tag, halfTicks, address);

export const fetchWithdrawal = (id: string) => getWithdrawal(relayers, id);

export const relayerHost = (i: number) => new URL(relayers[i]).host;
