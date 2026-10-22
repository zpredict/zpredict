// Withdrawals: the account's tag is XOR-shared like an order's, so no relayer learns
// whose withdrawal it is or can forge one; the amount and the address are public (the
// payout needs them).

import { fromHex, random, toHex } from "./bytes.js";
import { at, call, distinct, postEach, type Relayers } from "./http.js";

/** Half-ticks kept from every withdrawal toward the payout fee (10,000 zats). */
export const WITHDRAWAL_FEE = 2n;
/** Zatoshis per half-tick: 1 unit (0.01 ZEC) = 200 half-ticks. */
export const ZATS_PER_HALF_TICK = 5_000n;

/** `POST /withdrawals`: withdrawalId hex32, share hex32 (of the tag), amount in half-ticks. */
export interface WithdrawalPost {
	withdrawalId: string;
	share: string;
	amount: number;
	address: string;
}

/** `GET /withdrawals/:withdrawalId`; txid once paid. */
export interface WithdrawalStatus {
	status: "pending" | "refused" | "debited" | "paying" | "paid";
	txid?: string;
}

/** Zatoshis a withdrawal of `amount` half-ticks pays out. */
export const payoutZats = (amount: bigint) => (amount - WITHDRAWAL_FEE) * ZATS_PER_HALF_TICK;

/**
 * Asks all three relayers to pay `amount` half-ticks from account `tag` to `address`, a
 * fresh unified address with an Orchard receiver. Relayer i gets only a fresh share i of
 * the tag. It is taken only if the account covers it.
 */
export async function submitWithdrawal(
	relayers: Relayers,
	tag: string,
	amount: bigint,
	address: string,
) {
	distinct(relayers);
	if (amount <= WITHDRAWAL_FEE || amount > BigInt(Number.MAX_SAFE_INTEGER)) {
		throw new RangeError("amount must exceed the fee");
	}
	const key = fromHex(tag);
	if (key.length !== 16) throw new RangeError("tag must be 16 bytes");
	const [r0, r1] = [random(16), random(16)];
	const shares = [r0, r1, key.map((x, i) => x ^ r0[i] ^ r1[i])];
	const withdrawalId = toHex(random(16));
	await postEach(
		relayers,
		"/withdrawals",
		shares.map(
			(s) =>
				({
					withdrawalId,
					share: toHex(s),
					amount: Number(amount),
					address,
				}) satisfies WithdrawalPost,
		),
	);
	return { withdrawalId };
}

/** Relayer 0 builds and broadcasts the payout, so its view is the one to show. */
export const getWithdrawal = (relayers: Relayers, withdrawalId: string) =>
	call<WithdrawalStatus>(at(relayers[0], `/withdrawals/${encodeURIComponent(withdrawalId)}`));
