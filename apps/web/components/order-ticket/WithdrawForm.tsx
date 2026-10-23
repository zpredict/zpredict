"use client";
import {
	HALF_TICKS_PER_UNIT,
	payoutZats,
	WITHDRAWAL_FEE,
	type WithdrawalStatus,
	withdrawalAddressProblem,
} from "@zpredict/sdk";
import { useState } from "react";
import NumberField from "@/components/order-ticket/NumberField";
import Button from "@/components/ui/Button";
import { useAccount } from "@/hooks/useAccount";
import { useWithdraw } from "@/hooks/useWithdraw";
import { units } from "@/lib/format";

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

/** Withdraw to a fresh shielded address. Each relayer gets only a share of the account. */
export default function WithdrawForm() {
	const { tag, balance, mock } = useAccount();
	const [amount, setAmount] = useState(1);
	const [address, setAddress] = useState("");
	const { submit, status, error, pending } = useWithdraw(tag);
	// Nothing until the relayers say whether this is a judge account, so no enabled form flashes.
	if (!tag || mock === null) return null;
	if (mock)
		return (
			<details className="deposit">
				<summary>Withdraw</summary>
				<p className="dim">
					Mock: judge-mode credit can&apos;t be withdrawn; the relayers refuse it inside the MPC. To
					try a real withdrawal, deposit testnet ZEC with a new account tag (Deposit).
				</p>
			</details>
		);
	const halfTicks = BigInt(Number.isNaN(amount) ? 0 : amount) * HALF_TICKS_PER_UNIT;
	const max = Number((balance ?? 0n) / HALF_TICKS_PER_UNIT);
	const zec = (Number(halfTicks > WITHDRAWAL_FEE ? payoutZats(halfTicks) : 0n) / 1e8).toFixed(4);
	// Shown once something is typed: testnet unified address, Ironwood receiver, nothing transparent.
	const problem = address ? withdrawalAddressProblem(address, "test") : null;

	return (
		<details className="deposit">
			<summary>Withdraw</summary>
			<p className="dim">
				Paid from the escrow in one batched shielded transaction, to a fresh unified address with an
				Ironwood (Orchard) receiver. The relayers see the amount, the address and the time, but not
				which account it came from, except through request metadata and amount and timing (see the
				threat model). Balance: {units(balance ?? 0n)} units.
			</p>
			<NumberField
				id="withdraw-units"
				label="Amount"
				max={max}
				min={1}
				onChange={setAmount}
				unit="units"
				value={amount}
			/>
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
			<p aria-live="polite" className={problem ? "ticket__err" : "dim"} id="withdraw-address-check">
				{problem ?? addressHint(address)}
			</p>
			<p className="dim">
				You receive {zec} ZEC: the amount less a {units(WITHDRAWAL_FEE)}-unit network fee.
			</p>
			<Button
				disabled={
					pending || !address || problem !== null || halfTicks <= WITHDRAWAL_FEE || amount > max
				}
				onClick={() => submit(halfTicks, address)}
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
