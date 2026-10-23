import type { Metadata } from "next";
import FaucetScreen from "@/components/faucet/FaucetScreen";

export const metadata: Metadata = { title: "Testnet faucet" };

export default function FaucetPage() {
	return (
		<main>
			<FaucetScreen />
		</main>
	);
}
