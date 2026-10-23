"use client";
import { HALF_TICKS_PER_UNIT, payoutZats, WITHDRAWAL_FEE } from "@zpredict/sdk";
import { useState } from "react";
import NumberField from "@/components/order-ticket/NumberField";
import Button from "@/components/ui/Button";
import { useAccount } from "@/hooks/useAccount";
import { useWithdraw } from "@/hooks/useWithdraw";
import { units } from "@/lib/format";

/** Withdraw to a fresh shielded address. Each relayer gets only a share of the account. */
export default function WithdrawForm() {
	const { tag, balance, judge } = useAccount();
	const [amount, setAmount] = useState(1);
	const [address, setAddress] = useState("");
	const { submit, status, error, pending } = useWithdraw(tag);
	if (!tag) return null;
	if (judge)
		return (
			<details className="deposit">
				<summary>Withdraw</summary>
				<p className="dim">
					Mock: judge-mode credits are demo collateral, not escrow funds, so they can&apos;t be
					withdrawn as testnet ZEC. A real withdrawal needs an account funded by a real deposit:
					under Deposit, forget this account, create your own tag and send a testnet deposit to it.
				</p>
			</details>
		);
	const halfTicks = BigInt(Number.isNaN(amount) ? 0 : amount) * HALF_TICKS_PER_UNIT;
	const max = Number((balance ?? 0n) / HALF_TICKS_PER_UNIT);
	const zec = (Number(halfTicks > WITHDRAWAL_FEE ? payoutZats(halfTicks) : 0n) / 1e8).toFixed(4);

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
				<span className="field__label">Fresh shielded address</span>
				<span className="field__box">
					<input
						autoComplete="off"
						id="withdraw-address"
						onChange={(e) => setAddress(e.target.value.trim())}
						spellCheck={false}
						value={address}
					/>
				</span>
			</label>
			<p className="dim">
				You receive {zec} ZEC: the amount less a {units(WITHDRAWAL_FEE)}-unit network fee.
			</p>
			<Button
				disabled={pending || !address || halfTicks <= WITHDRAWAL_FEE || amount > max}
				onClick={() => submit(halfTicks, address)}
			>
				Withdraw
			</Button>
			{status && (
				<p className="dim">
					{status.status}
					{status.txid && <code className="deposit__ua">{status.txid}</code>}
				</p>
			)}
			{error && <p className="dim">{error}</p>}
		</details>
	);
}
