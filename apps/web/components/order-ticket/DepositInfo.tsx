"use client";
import { MAX_DEPOSIT_NOTES, unitsToZec } from "@zpredict/sdk";
import Link from "next/link";
import { useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import CopyButton from "@/components/ui/CopyButton";
import ZecIcon from "@/components/ui/ZecIcon";
import DepositQr from "@/components/wallet/DepositQr";
import DepositStatus from "@/components/wallet/DepositStatus";
import { useAccount } from "@/hooks/useAccount";
import { depositParts, useDeposit } from "@/hooks/useDeposit";

const QUICK = ["0.05", "0.25", "1", "5", "25"];
/** Notes one QR code holds and a phone still scans (~1.4 kB of request); past it, one QR per note. */
const QR_NOTES = 4;

/** "1 × 25 ZEC · 2 × 5 ZEC": the notes a deposit splits into, grouped. */
function breakdown(parts: number[]): string {
	const counts = new Map<number, number>();
	for (const p of parts) counts.set(p, (counts.get(p) ?? 0) + 1);
	return [...counts].map(([u, n]) => `${n} × ${unitsToZec(u as 1)} ZEC`).join(" · ");
}

/** Whole units (0.01 ZEC) in a typed ZEC amount; null unless it is a positive multiple of 0.01. */
function toUnits(text: string): number | null {
	if (!/^\s*\d+([.,]\d+)?\s*$/.test(text)) return null; // no 1e3, 0x10 or -1
	const zec = Number(text.replace(",", "."));
	const units = Math.round(zec * 100);
	return Number.isFinite(zec) && units >= 1 && Math.abs(zec * 100 - units) < 1e-6 ? units : null;
}

/**
 * A real testnet deposit of any amount: split into the sizes the relayers credit (0.01 to 25
 * ZEC), each note tagged with its own encrypted memo, all in one ZIP 321 request (QR, copy, or
 * open in a wallet), with live status. `open` shows it expanded.
 */
export default function DepositInfo({ open = false }: { open?: boolean }) {
	const { tag, create, forget } = useAccount();
	const [text, setText] = useState("0.25");
	const units = toUnits(text);
	const parts = units === null ? null : depositParts(units);
	const { request, error, escrowReady } = useDeposit(tag, units ?? 0);
	const zec = units === null ? text : unitsToZec(units as 1);

	return (
		<details className="deposit" open={open}>
			<summary>Deposit</summary>
			<ol className="deposit__steps">
				<li>
					Amount, from 0.01 ZEC:
					<span className="deposit__amount">
						<input
							aria-label="Deposit amount in ZEC"
							className="deposit__input num"
							inputMode="decimal"
							onChange={(e) => setText(e.target.value)}
							value={text}
						/>
						<span>ZEC</span>
					</span>
					<span className="deposit__quick">
						{QUICK.map((q) => (
							<button className="chip" key={q} onClick={() => setText(q)} type="button">
								{q}
							</button>
						))}
					</span>
					{units === null ? (
						<span className="ticket__err">Use steps of 0.01 ZEC.</span>
					) : parts === null ? (
						<span className="ticket__err">
							Over {MAX_DEPOSIT_NOTES} notes: split it into two deposits.
						</span>
					) : (
						<span className="deposit__split dim">
							Sent as {breakdown(parts)}
							{parts.length > 1 &&
								", in one transaction (the relayers can see the total; the chain can't)"}
							.
						</span>
					)}
				</li>
				<li>
					{tag ? (
						"Your account key stays in this browser. Back it up below."
					) : (
						<>
							Create your account (a key kept in this browser).{" "}
							<Button onClick={create} variant="ghost">
								Create account tag
							</Button>
						</>
					)}
				</li>
				<li>
					Pay{" "}
					<strong>
						<ZecIcon /> {zec} testnet ZEC
					</strong>{" "}
					with this request. Don&apos;t edit the amounts or memos.
					{request && (
						<>
							{request.parts.length <= QR_NOTES ? (
								<DepositQr uri={request.uri} />
							) : (
								<p className="dim">
									Too many notes for one QR code: open it in a wallet here, or scan them one by one
									below.
								</p>
							)}
							<code className="deposit__ua">{request.uri}</code>
							<span className="deposit__actions">
								<CopyButton label="Copy payment request" text={request.uri} />
								<a className="btn btn--ghost" href={request.uri}>
									Open in wallet
								</a>
								<CopyButton label="Copy escrow address" text={request.escrow} />
							</span>
							{request.parts.length > 1 && (
								<details className="deposit__parts" open={request.parts.length > QR_NOTES}>
									<summary>Pay the notes one by one</summary>
									<ol>
										{request.parts.map((p, i) => (
											// biome-ignore lint/suspicious/noArrayIndexKey: parts of one request, never reordered
											<li key={i}>
												{unitsToZec(p.units)} ZEC{" "}
												<a className="btn btn--ghost" href={p.uri}>
													Open in wallet
												</a>{" "}
												<CopyButton label="Copy" text={p.uri} />
												{request.parts.length > QR_NOTES && <DepositQr uri={p.uri} />}
											</li>
										))}
									</ol>
								</details>
							)}
						</>
					)}
				</li>
				<li>
					Credited after 10 confirmations (about 5–7 min).
					{request && <DepositStatus />}
				</li>
				<li>
					No testnet ZEC? Use the <Link href="/faucet/">faucet</Link>.
				</li>
			</ol>
			{!escrowReady && (
				<p className="dim">
					<Badge tone="mock">Not live</Badge> The escrow address is published after the
					relayers&apos; key ceremony.
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
