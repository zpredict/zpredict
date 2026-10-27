import type { Metadata } from "next";
import PortfolioScreen from "@/components/portfolio/PortfolioScreen";

export const metadata: Metadata = { title: "Account" };

export default function PortfolioPage() {
	return (
		<main className="wallet">
			<PortfolioScreen />
		</main>
	);
}
