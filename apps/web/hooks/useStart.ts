"use client";
import { TableFullError } from "@zpredict/sdk";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAccount } from "./useAccount";

/** Judge mode: one click claims a demo account (if none yet) and opens the trade page. */
export function useJudge(market?: number) {
	const { tag, claim } = useAccount();
	const router = useRouter();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");

	const start = async () => {
		setError("");
		if (!tag) {
			setBusy(true);
			try {
				await claim();
			} catch (e) {
				setError(
					e instanceof TableFullError
						? "Demo accounts are all taken: the relayers' balance table is full."
						: "Relayers unreachable",
				);
				return;
			} finally {
				setBusy(false);
			}
		}
		router.push(market ? `/trade/?m=${market}` : "/trade/");
	};

	const label = busy ? "Funding…" : tag ? "Trade now" : "Judge mode";
	return { start, busy, error, label, hasAccount: Boolean(tag) };
}
