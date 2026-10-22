"use client";
// A deposit request for one fixed denomination: the escrow address and a fresh memo that
// carries the account tag, encrypted to each relayer with the key that relayer publishes.
import { type Denomination, depositUri, encodeMemo, type MemoKeys } from "@zpredict/sdk";
import { useEffect, useState } from "react";
import { ESCROW_UA } from "@/lib/config";
import { fetchMemoKeys } from "@/lib/relayer";

export interface DepositRequest {
	/** ZIP 321 `zcash:` URI: address, amount and memo in one string a wallet can open. */
	uri: string;
	escrow: string;
}

export function useDeposit(tag: string | null, units: Denomination) {
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
		if (!escrow || !tag || !keys) return;
		let live = true;
		// A fresh ephemeral key per memo: two requests for the same tag never look alike.
		encodeMemo(tag, keys).then(
			(memo) => live && setRequest({ uri: depositUri(escrow, units, memo), escrow }),
			() => live && setError("This browser can't build the memo (X25519 unavailable)."),
		);
		return () => {
			live = false;
		};
	}, [tag, keys, units]);

	return { request, error, escrowReady: ESCROW_UA !== null };
}
