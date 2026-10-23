// The testnet faucet (apps/faucet): one 1-unit deposit into the caller's own account. The
// browser builds the memo (so the faucet never sees the tag), solves a hashcash challenge
// and, when the faucet asks for it, passes a Turnstile token issued for that challenge.
//
//   digest = BLAKE2b-256(personal "zPredictFaucetPw", challenge ‖ BLAKE2b-256(memo) ‖ nonce u64 LE)
//   a nonce solves the challenge when digest starts with `bits` zero bits

import { blake2b } from "@noble/hashes/blake2.js";
import { fromHex } from "./bytes.js";
import { at, call } from "./http.js";
import { MEMO_LEN, memoParam } from "./memo.js";

export interface FaucetStatus {
	enabled: boolean;
	/** Spendable shielded zats at the faucet's last sync; null while syncing. */
	balance: number | null;
	/** Zats per drop (one unit). */
	drop: number;
	/** Seconds until the next drop may go out. */
	nextDrop: number;
	leftToday: number;
	powBits: number;
	/** Whether a drip needs a Turnstile token. */
	turnstile: boolean;
	/** With `?tx=`: whether the faucet sent it and its mined height. */
	tx: { known: boolean; mined: number | null } | null;
}

export interface FaucetChallenge {
	challenge: string;
	bits: number;
	ttl: number;
}

export const getFaucetStatus = (url: string, tx?: string) =>
	call<FaucetStatus>(at(url, `/status${tx ? `?tx=${tx}` : ""}`));

export const getFaucetChallenge = (url: string) =>
	call<FaucetChallenge>(at(url, "/challenge"), { method: "POST" });

const PERSONAL = new TextEncoder().encode("zPredictFaucetPw");

function zeroBits(h: Uint8Array): number {
	let n = 0;
	for (const b of h) {
		if (b === 0) n += 8;
		else return n + Math.clz32(b) - 24;
	}
	return n;
}

/**
 * The first nonce that solves `challenge` for this 512-byte memo. Yields to the event loop
 * every few thousand hashes so the page stays responsive.
 */
export async function solveFaucetPow(
	challenge: string,
	memo: Uint8Array,
	bits: number,
): Promise<number> {
	if (memo.length !== MEMO_LEN) throw new RangeError("memo must be 512 bytes");
	const memoHash = blake2b(memo, { dkLen: 32 });
	const c = fromHex(challenge);
	const input = new Uint8Array(c.length + 32 + 8);
	input.set(c);
	input.set(memoHash, c.length);
	const view = new DataView(input.buffer, c.length + 32, 8);
	for (let nonce = 0; ; nonce++) {
		view.setBigUint64(0, BigInt(nonce), true);
		if (zeroBits(blake2b(input, { dkLen: 32, personalization: PERSONAL })) >= bits) return nonce;
		if (nonce % 4096 === 4095) await new Promise((r) => setTimeout(r, 0));
	}
}

export class FaucetError extends Error {
	constructor(
		message: string,
		readonly status: number,
		/** Seconds to wait, on 429. */
		readonly retryAfter: number | null,
	) {
		super(message);
	}
}

/** Asks the faucet to send one unit with `memo` to the escrow; returns the txid. */
export async function faucetDrip(
	url: string,
	memo: Uint8Array,
	pow: { challenge: string; nonce: number },
	turnstile = "",
): Promise<string> {
	const r = await fetch(at(url, "/drip"), {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ memo: memoParam(memo), pow, turnstile }),
		credentials: "omit",
		referrerPolicy: "no-referrer",
	});
	const body = (await r.json().catch(() => ({}))) as {
		txid?: string;
		error?: string;
		retryAfter?: number;
	};
	if (!r.ok || !body.txid) {
		throw new FaucetError(body.error ?? `${r.status}`, r.status, body.retryAfter ?? null);
	}
	return body.txid;
}
