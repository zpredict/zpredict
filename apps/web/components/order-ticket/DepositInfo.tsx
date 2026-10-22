"use client";
import { type Denomination, unitsToZec } from "@zpredict/sdk";
import { useState } from "react";
import DenominationPicker from "@/components/order-ticket/DenominationPicker";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import CopyButton from "@/components/ui/CopyButton";
import { useAccount } from "@/hooks/useAccount";
import { useDeposit } from "@/hooks/useDeposit";

/** A real testnet deposit: one fixed-size note to the escrow, tagged in an encrypted memo. */
export default function DepositInfo() {
	const { tag, create, forget } = useAccount();
	const [units, setUnits] = useState<Denomination>(5);
	const { request, error, escrowReady } = useDeposit(tag, units);
	const zec = unitsToZec(units);

	return (
		<details className="deposit">
			<summary>Deposit</summary>
			<ol className="deposit__steps">
				<li>
					Pick one fixed size. Every deposit is one of these three, so the amount never reveals a
					bet size.
					<DenominationPicker onChange={setUnits} units={units} />
				</li>
				<li>
					{tag ? (
						"Your account tag stays in this browser. It is the only key to your balance."
					) : (
						<>
							Create an account tag. It is made in this browser and never leaves it in clear.{" "}
							<Button onClick={create} variant="ghost">
								Create account tag
							</Button>
						</>
					)}
				</li>
				<li>
					From a shielded wallet, send exactly <strong>{zec} ZEC</strong> with this payment request.
					It pays the escrow&apos;s unified address (Ironwood receiver only, FROST 2-of-3) and
					carries a memo giving each relayer only its own share of your tag. Don&apos;t edit the
					amount or the memo.
					{request && (
						<>
							<code className="deposit__ua">{request.uri}</code>
							<span className="deposit__actions">
								<CopyButton label="Copy payment request" text={request.uri} />
								<a className="btn btn--ghost" href={request.uri}>
									Open in wallet
								</a>
								<CopyButton label="Copy escrow address" text={request.escrow} />
							</span>
						</>
					)}
				</li>
				<li>After 10 confirmations each relayer credits your balance.</li>
			</ol>
			{!escrowReady && (
				<p className="dim">
					<Badge tone="mock">Not live</Badge> The escrow address is published after the
					relayers&apos; key ceremony. Until then, use judge mode for a demo balance.
				</p>
			)}
			{error && <p className="dim">{error}</p>}
			{tag && (
				<Button onClick={forget} variant="ghost">
					Forget this account
				</Button>
			)}
		</details>
	);
}
