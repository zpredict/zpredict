import type { Metadata } from "next";
import FundsPage from "@/components/wallet/FundsPage";

export const metadata: Metadata = { title: "Withdraw" };

export default function WithdrawPage() {
	return (
		<main className="wallet">
			<FundsPage kind="withdraw" />
		</main>
	);
}
