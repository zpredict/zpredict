"use client";
// A deposit request for any amount: split into credited denominations, each note with a fresh
// memo carrying the account tag (encrypted to each relayer), all in one ZIP 321 request.
import {
	type Denomination,
	depositRequest,
	depositUri,
	encodeMemo,
	type MemoKeys,
	splitDeposit,
} from "@zpredict/sdk";
import { useEffect, useState } from "react";
import { ESCROW_UA } from "@/lib/config";
import { fetchMemoKeys } from "@/lib/relayer";

export interface DepositRequest {
	/** ZIP 321 `zcash:` URI paying every part in one transaction. */
	uri: string;
	/** Each part as its own request, for wallets that can't read multi-payment requests. */
	parts: { units: Denomination; uri: string }[];
	escrow: string;
}

/** Splits `units` (whole units of 0.01 ZEC); null when it can't be split. */
export function depositParts(units: number): Denomination[] | null {
	try {
		return splitDeposit(units);
	} catch {
		return null;
	}
}

export function useDeposit(tag: string | null, units: number) {
	const [keys, setKeys] = useState<MemoKeys | null>(null);
	const [request, setRequest] = useState<DepositRequest | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!ESCROW_UA) return;
		fetchMemoKeys().then(setKeys, () =>
			setError("The relayers don't publish their memo keys yet, so a deposit can't be tagged."),
		);
	}, []);

	useEffect(() => {
		setRequest(null);
		const escrow = ESCROW_UA;
		const split = depositParts(units);
		if (!escrow || !tag || !keys || !split) return;
		let live = true;
		// A fresh ephemeral key per memo: no two notes, or requests, look alike.
		Promise.all(split.map(() => encodeMemo(tag, keys))).then(
			(memos) => {
				if (!live) return;
				const parts = split.map((u, i) => ({ units: u, memo: memos[i] }));
				setRequest({
					uri: depositRequest(escrow, parts),
					parts: parts.map((p) => ({ units: p.units, uri: depositUri(escrow, p.units, p.memo) })),
					escrow,
				});
			},
			() => live && setError("This browser can't build the memo (X25519 unavailable)."),
		);
		return () => {
			live = false;
		};
	}, [tag, keys, units]);

	return { request, error, escrowReady: ESCROW_UA !== null };
}
