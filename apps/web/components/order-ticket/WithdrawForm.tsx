"use client";
import {
	HALF_TICKS_PER_UNIT,
	payoutZats,
	WITHDRAWAL_FEE,
	type WithdrawalStatus,
	withdrawalAddressProblem,
} from "@zpredict/sdk";
import { useState } from "react";
import Amount from "@/components/ui/Amount";
import Button from "@/components/ui/Button";
import ZecIcon from "@/components/ui/ZecIcon";
import { useAccount } from "@/hooks/useAccount";
import { useWithdraw } from "@/hooks/useWithdraw";
import { zatsToZec } from "@/lib/format";
import { addressUsed } from "@/lib/storage";
import WithdrawAmount from "./WithdrawAmount";

const statusText = (s: WithdrawalStatus) =>
	s.status === "debited" && s.payout === "retrying"
		? "Debited; waiting for escrow funds: the payout is retried automatically."
		: s.status === "refused"
			? "Refused: the balance doesn't cover it."
			: s.status;

const addressHint = (address: string) =>
	address
		? "Address OK: testnet, with an Ironwood receiver and no transparent one."
		: "Shielded only: the payout goes to the address's Ironwood (Orchard) receiver.";

/** The line under the address: its problem, a reuse warning (#91), or a hint. */
function addressCheck(address: string, problem: string | null) {
	if (problem) return { text: problem, bad: true };
	if (addressUsed(address))
		return {
			text: "You withdrew to this address before. The relayers see the reuse and can link both withdrawals: use a fresh address.",
			bad: true,
		};
	return { text: addressHint(address), bad: false };
}

/**
 * Withdraw to a fresh shielded address. Each relayer gets only a share of the account, but
 * sees the amount and address, so the form offers the deposit sizes and warns on a reused
 * address (#91).
 */
export default function WithdrawForm() {
	const { tag, balance, mock } = useAccount();
	const [amount, setAmount] = useState(1);
	const [address, setAddress] = useState("");
	const { submit, status, error, pending } = useWithdraw(tag);
	// Nothing until the relayers have answered for this account, so no enabled form flashes.
	if (!tag || mock === null) return null;
	const halfTicks = BigInt(Number.isNaN(amount) ? 0 : amount) * HALF_TICKS_PER_UNIT;
	const max = Number((balance ?? 0n) / HALF_TICKS_PER_UNIT);
	const zec = zatsToZec(halfTicks > WITHDRAWAL_FEE ? payoutZats(halfTicks) : 0n);
	// Shown once something is typed: testnet unified address, Ironwood receiver, nothing transparent.
	const problem = address ? withdrawalAddressProblem(address, "test") : null;
	const check = addressCheck(address, problem);

	return (
		<details className="deposit">
			<summary>Withdraw</summary>
			<p className="dim">
				Paid from the escrow in one batched shielded transaction, to a fresh unified address with an
				Ironwood (Orchard) receiver. The relayers see the amount, the address and the time, but not
				which account it came from, except through request metadata and amount and timing (see the
				threat model). Withdrawing in the deposit sizes keeps your amount common; the rest stays in
				your balance. Balance: <Amount halfTicks={balance ?? 0n} />.
			</p>
			<WithdrawAmount max={max} onChange={setAmount} value={amount} />
			<label className="field" htmlFor="withdraw-address">
				<span className="field__label">Fresh testnet unified address (utest1…)</span>
				<span className={`field__box${problem ? " is-bad" : ""}`}>
					<input
						aria-describedby="withdraw-address-check"
						aria-invalid={problem !== null}
						autoComplete="off"
						id="withdraw-address"
						onChange={(e) => setAddress(e.target.value.trim())}
						spellCheck={false}
						value={address}
					/>
				</span>
			</label>
			<p
				aria-live="polite"
				className={check.bad ? "ticket__err" : "dim"}
				id="withdraw-address-check"
			>
				{check.text}
			</p>
			<p className="dim">
				You receive <ZecIcon /> {zec} testnet ZEC: the amount less a{" "}
				<Amount halfTicks={WITHDRAWAL_FEE} /> network fee.
			</p>
			<Button
				disabled={
					pending || !address || problem !== null || halfTicks <= WITHDRAWAL_FEE || amount > max
				}
				onClick={() => submit(halfTicks, address).then((ok) => ok && setAddress(""))}
			>
				Withdraw
			</Button>
			{status && (
				<p className="dim">
					{statusText(status)}
					{status.txid && <code className="deposit__ua">{status.txid}</code>}
				</p>
			)}
			{error && <p className="dim">{error}</p>}
		</details>
	);
}
