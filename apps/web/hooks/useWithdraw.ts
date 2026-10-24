"use client";
// One withdrawal at a time: submit to all three relayers, then follow relayer 0's view
// of it until it is paid or refused.
import type { WithdrawalStatus } from "@zpredict/sdk";
import { useCallback, useState } from "react";
import { POLL_MS } from "@/lib/config";
import { fetchWithdrawal, withdraw } from "@/lib/relayer";
import { rememberAddress } from "@/lib/storage";
import { useAccount } from "./useAccount";
import { usePoll } from "./usePoll";

const DONE = new Set<WithdrawalStatus["status"]>(["paid", "refused"]);

export function useWithdraw(tag: string | null) {
	const [id, setId] = useState<string | null>(null);
	const [status, setStatus] = useState<WithdrawalStatus | null>(null);
	const [error, setError] = useState<string | null>(null);
	const { refreshSoon } = useAccount();

	/** Resolves true once the relayers accepted the request; the address is then remembered. */
	const submit = useCallback(
		async (halfTicks: bigint, address: string) => {
			if (!tag) return false;
			setError(null);
			setStatus(null);
			try {
				setId((await withdraw(tag, halfTicks, address)).withdrawalId);
				rememberAddress(address);
				return true;
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
				return false;
			}
		},
		[tag],
	);

	const follow = useCallback(async () => {
		if (!id || (status && DONE.has(status.status))) return;
		const s = await fetchWithdrawal(id);
		// The batch debited (or refused) it: one jittered balance read, as after an order (#90).
		if (s.status !== "pending" && (!status || status.status === "pending")) refreshSoon();
		setStatus(s);
	}, [id, status, refreshSoon]);

	usePoll(follow, POLL_MS.fills, id);

	return { submit, status, error, pending: id !== null && !(status && DONE.has(status.status)) };
}
