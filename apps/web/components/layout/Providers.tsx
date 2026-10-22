"use client";
import type { ReactNode } from "react";
import { AccountProvider } from "@/hooks/useAccount";
import { OrdersProvider } from "@/hooks/useOrders";

export default function Providers({ children }: { children: ReactNode }) {
	return (
		<AccountProvider>
			<OrdersProvider>{children}</OrdersProvider>
		</AccountProvider>
	);
}
