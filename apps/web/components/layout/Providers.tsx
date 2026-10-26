"use client";
import type { ReactNode } from "react";
import { AccountProvider } from "@/hooks/useAccount";
import { OrdersProvider } from "@/hooks/useOrders";
import { PriceProvider } from "@/hooks/usePrice";

export default function Providers({ children }: { children: ReactNode }) {
	return (
		<AccountProvider>
			<OrdersProvider>
				<PriceProvider>{children}</PriceProvider>
			</OrdersProvider>
		</AccountProvider>
	);
}
