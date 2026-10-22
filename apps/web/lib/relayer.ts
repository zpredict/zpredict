// Thin wrapper over @zpredict/sdk bound to the configured relayers.
// Each relayer only ever receives its own share; requests carry no cookies and no referrer.
import {
	getBalance,
	getFill,
	getGroupKey,
	getMemoKeys,
	getView,
	getWithdrawal,
	type Health,
	type JudgeClaim,
	type Market,
	type Side,
	submitOrder,
	submitWithdrawal,
	tagAccount,
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

/** Mock, testnet only: a fresh tag credited with demo balance. */
export const claimJudge = () =>
	json<JudgeClaim>(at(relayers[0], "/judge/claim"), { method: "POST" });

export const fetchBalance = (tag: string) => getBalance(relayers, tag);

export const fetchFill = (orderId: string) => getFill(relayers, orderId);

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

/** Encodes, splits and sends share i to relayer i only. */
export const placeOrder = (o: OrderInput, tag: string) =>
	submitOrder(relayers, { ...o, account: tagAccount(tag) });

/** Sends relayer i only its share of the account; amount (half-ticks) and address are public. */
export const withdraw = (tag: string, halfTicks: bigint, address: string) =>
	submitWithdrawal(relayers, tag, halfTicks, address);

export const fetchWithdrawal = (id: string) => getWithdrawal(relayers, id);

export const relayerHost = (i: number) => new URL(relayers[i]).host;
