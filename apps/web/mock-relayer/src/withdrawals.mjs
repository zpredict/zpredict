// Withdrawals, MOCK: once all three relayers hold their share of the account, the mock
// combines them in the clear, debits the balance if it covers the amount, and "pays" with
// a made-up txid. The real relayers debit inside MPC and pay with a FROST-signed tx.
import { randomBytes } from "node:crypto";
import { hex, xor } from "./shares.mjs";
import { account } from "./state.mjs";

const FEE = 2n;
const HEX = (n) => new RegExp(`^[0-9a-f]{${n}}$`);
/** id -> { shares: [Buffer|null x3], amount: bigint, address, status, txid? } */
const withdrawals = new Map();

export async function postWithdrawal(i, req, res, send, readJson) {
	const b = await readJson(req);
	const ok = b && HEX(32).test(b.withdrawalId) && HEX(16).test(b.share);
	if (!ok || !Number.isSafeInteger(b.amount) || BigInt(b.amount) <= FEE || !b.address)
		return send(res, 400, { error: "bad withdrawal" });
	let w = withdrawals.get(b.withdrawalId);
	if (!w) {
		w = { shares: [null, null, null], amount: BigInt(b.amount), address: b.address };
		w.status = "pending";
		withdrawals.set(b.withdrawalId, w);
	}
	if (w.shares[i]) return send(res, 409, { error: "duplicate" });
	w.shares[i] = Buffer.from(b.share, "hex");
	if (w.shares.every(Boolean)) {
		const a = account(xor(...w.shares).readBigUInt64LE(0));
		w.status = a.bal >= w.amount ? "paid" : "refused";
		if (w.status === "paid") {
			a.bal -= w.amount;
			w.txid = hex(randomBytes(32));
		}
	}
	send(res, 202, {});
}

export function getWithdrawal(id, res, send) {
	const w = withdrawals.get(id);
	if (!w) return send(res, 404, { error: "unknown withdrawal" });
	send(res, 200, w.txid ? { status: w.status, txid: w.txid } : { status: w.status });
}
