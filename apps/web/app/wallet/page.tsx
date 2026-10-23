import type { Metadata } from "next";
import WalletGuide from "@/components/wallet/WalletGuide";

export const metadata: Metadata = { title: "Your wallet" };

export default function WalletPage() {
	return (
		<main className="wallet">
			<WalletGuide />
		</main>
	);
}
