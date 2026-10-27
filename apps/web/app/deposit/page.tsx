import type { Metadata } from "next";
import FundsPage from "@/components/wallet/FundsPage";

export const metadata: Metadata = { title: "Deposit" };

export default function DepositPage() {
	return (
		<main className="wallet">
			<FundsPage kind="deposit" />
		</main>
	);
}
