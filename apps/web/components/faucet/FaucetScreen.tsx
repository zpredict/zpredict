"use client";
import type { FaucetStatus } from "@zpredict/sdk";
import { useRef } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Pane from "@/components/ui/Pane";
import ZecIcon from "@/components/ui/ZecIcon";
import { useAccount } from "@/hooks/useAccount";
import { zatsToZec } from "@/lib/format";
import { type Phase, useFaucet } from "./useFaucet";

const STEPS = ["sent", "mined", "credited"] as const;

function Progress({ phase }: { phase: Phase }) {
	if (phase.k !== "sent" && phase.k !== "mined" && phase.k !== "credited") return null;
	const at = STEPS.indexOf(phase.k);
	return (
		<div className="faucet__progress">
			<ol>
				{STEPS.map((s, i) => (
					<li className={i <= at ? "is-done" : ""} key={s}>
						[{i <= at ? "x" : " "}] {s}
						{s === "mined" && phase.k === "mined" && phase.height ? ` at ${phase.height}` : ""}
					</li>
				))}
			</ol>
			<p className="dim">
				txid <code>{phase.txid}</code>
			</p>
			{phase.k !== "credited" && (
				<p className="dim">
					Each relayer credits it after 10 confirmations (about 13 minutes on testnet). This page
					can stay open; your balance updates on its own.
				</p>
			)}
		</div>
	);
}

function StatusList({ status, down }: { status: FaucetStatus | null; down: boolean }) {
	let state = <>…</>;
	if (down) state = <Badge tone="no">Unreachable</Badge>;
	else if (status?.enabled) state = <Badge tone="live">Live</Badge>;
	else if (status) state = <Badge tone="mock">Paused</Badge>;
	const next = status && (status.nextDrop ? `in ${status.nextDrop} s` : "now");
	return (
		<dl className="faucet__status">
			<dt>Faucet</dt>
			<dd>{state}</dd>
			<dt>Balance</dt>
			<dd>
				{status?.balance != null ? (
					<>
						<ZecIcon /> {zatsToZec(BigInt(status.balance))} ZEC
					</>
				) : (
					"…"
				)}
			</dd>
			<dt>Next drop</dt>
			<dd>{next ?? "…"}</dd>
			<dt>Left today</dt>
			<dd>{status?.leftToday ?? "…"}</dd>
		</dl>
	);
}

/** /faucet: 0.05 testnet ZEC into this browser's own account, credited like any deposit. */
export default function FaucetScreen() {
	const { status, down, phase, request, tag } = useFaucet();
	const { create } = useAccount();
	const widget = useRef<HTMLDivElement>(null);
	const busy = phase.k === "working" || phase.k === "sent" || phase.k === "mined";
	const ready = Boolean(status?.enabled && tag && !busy);

	return (
		<Pane aria-labelledby="faucet-title" className="faucet" variant="dark">
			<p className="faucet__eyebrow">[ testnet faucet ]</p>
			<h1 className="faucet__title" id="faucet-title">
				Get 0.05 testnet ZEC into your account.
			</h1>
			<p>
				The faucet sends one fixed 0.05 TAZ shielded deposit to the escrow with a memo this browser
				builds for your account, so the relayers credit it like any deposit. You can trade with it
				or withdraw it to your own shielded wallet. Testnet only: TAZ has no value.
			</p>

			<StatusList down={down} status={status} />

			{!tag ? (
				<p>
					First create an account tag. It is made in this browser and never leaves it in clear.{" "}
					<Button onClick={create} variant="ghost">
						Create account tag
					</Button>
				</p>
			) : (
				<p>
					<Button disabled={!ready} onClick={() => widget.current && request(widget.current)}>
						Get testnet ZEC
					</Button>
				</p>
			)}
			<div className="faucet__widget" ref={widget} />
			{phase.k === "working" && <p className="dim">{phase.step}</p>}
			{phase.k === "error" && <p className="faucet__error">{phase.msg}</p>}
			<Progress phase={phase} />

			<p className="dim">
				Anti-abuse: when you click, this page loads Cloudflare Turnstile, which sees your IP and
				browser signals (never your orders or positions) and could link your IP to the time a 0.05
				ZEC deposit was sent. Then a proof of work, one drop at a time for everyone and a daily cap.
				The faucet itself keeps no IPs and no request logs, and never sees your tag.
			</p>
			<p className="dim">
				Have your own Zcash testnet wallet? Get TAZ from an external faucet such as{" "}
				<a href="https://zecfaucet.com/" rel="noreferrer">
					zecfaucet.com
				</a>{" "}
				(not run by zPredict), then deposit from the trade page.
			</p>
		</Pane>
	);
}
