"use client";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { useAccount } from "@/hooks/useAccount";
import { DENOMINATIONS, ESCROW_UA_PLACEHOLDER } from "@/lib/config";

/** How deposits will work; collapsed by default. */
export default function DepositInfo() {
	const { tag, forget } = useAccount();
	return (
		<details className="deposit">
			<summary>Deposit &amp; account</summary>
			<ol className="deposit__steps">
				<li>
					Send one note of a fixed size —{" "}
					{DENOMINATIONS.map((d) => (
						<Badge key={d} size="sm">
							{d} unit{d > 1 ? "s" : ""}
						</Badge>
					))}{" "}
					— so a deposit never reveals a bet size.
				</li>
				<li>
					To the escrow&apos;s shielded unified address (Ironwood receiver only, FROST 2-of-3):
					<code className="deposit__ua">{ESCROW_UA_PLACEHOLDER}</code>
					<Badge size="sm" tone="mock">
						Placeholder
					</Badge>
				</li>
				<li>
					The memo carries only your account tag, encrypted to each relayer. Never order data.
				</li>
			</ol>
			<p className="dim">Until the escrow is live on testnet, use judge mode for a demo balance.</p>
			{tag && (
				<Button onClick={forget} variant="ghost">
					Forget this account
				</Button>
			)}
		</details>
	);
}
