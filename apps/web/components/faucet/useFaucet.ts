"use client";
// One faucet drop into this browser's account: the memo is built here (the faucet never
// sees the tag), then proof of work and, if the faucet asks, Turnstile; then the status
// goes sent -> mined (faucet's wallet) -> credited (this account's balance, all relayers).
import {
	encodeMemo,
	FaucetError,
	type FaucetStatus,
	faucetDrip,
	getFaucetChallenge,
	getFaucetStatus,
	solveFaucetPow,
} from "@zpredict/sdk";
import { useCallback, useEffect, useState } from "react";
import { useAccount, useBalanceWatch } from "@/hooks/useAccount";
import { usePoll } from "@/hooks/usePoll";
import { FAUCET_URL, POLL_MS, TURNSTILE_SITE_KEY } from "@/lib/config";
import { fetchMemoKeys } from "@/lib/relayer";
import { turnstileToken } from "./turnstile";

export type Phase =
	| { k: "idle" }
	| { k: "working"; step: string }
	| { k: "sent" | "mined"; txid: string; from: bigint; height?: number }
	| { k: "credited"; txid: string }
	| { k: "error"; msg: string };

function turnstile(widget: HTMLElement, challenge: string) {
	if (!TURNSTILE_SITE_KEY) return Promise.reject(new Error("This build has no Turnstile site key"));
	return turnstileToken(widget, TURNSTILE_SITE_KEY, challenge);
}

function errorText(e: unknown) {
	const msg = (e instanceof Error ? e.message : String(e)).replace(/\.$/, "");
	const wait = e instanceof FaucetError && e.retryAfter ? ` Try again in ${e.retryAfter} s.` : "";
	return `${msg}.${wait}`;
}

export function useFaucet() {
	const { tag, balance } = useAccount();
	const [status, setStatus] = useState<FaucetStatus | null>(null);
	const [down, setDown] = useState(false);
	const [phase, setPhase] = useState<Phase>({ k: "idle" });
	const pending = phase.k === "sent" ? phase.txid : undefined;
	useBalanceWatch(phase.k === "sent" || phase.k === "mined");

	usePoll(
		async () => {
			try {
				const s = await getFaucetStatus(FAUCET_URL, pending);
				setStatus(s);
				setDown(false);
				const h = s.tx?.mined;
				if (h != null) setPhase((p) => (p.k === "sent" ? { ...p, k: "mined", height: h } : p));
			} catch {
				setDown(true);
			}
		},
		POLL_MS.faucet,
		pending,
	);

	useEffect(() => {
		if ((phase.k === "sent" || phase.k === "mined") && balance !== null) {
			if (balance > phase.from) {
				setPhase({ k: "credited", txid: phase.txid });
			}
		}
	}, [balance, phase]);

	const request = useCallback(
		async (widget: HTMLElement) => {
			if (!tag) return;
			const from = balance ?? 0n;
			try {
				setPhase({ k: "working", step: "Building the memo for your account…" });
				const memo = await encodeMemo(tag, await fetchMemoKeys());
				const ch = await getFaucetChallenge(FAUCET_URL);
				setPhase({ k: "working", step: "Proof of work and the anti-abuse check…" });
				const token = status?.turnstile ? turnstile(widget, ch.challenge) : Promise.resolve("");
				const [nonce, t] = await Promise.all([solveFaucetPow(ch.challenge, memo, ch.bits), token]);
				setPhase({ k: "working", step: "Sending the shielded deposit…" });
				const txid = await faucetDrip(FAUCET_URL, memo, { challenge: ch.challenge, nonce }, t);
				setPhase({ k: "sent", txid, from });
			} catch (e) {
				setPhase({ k: "error", msg: errorText(e) });
			}
		},
		[tag, balance, status],
	);

	return { status, down, phase, request, tag };
}
