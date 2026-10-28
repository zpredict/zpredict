"use client";
import type { ReactNode } from "react";
import { AccountProvider } from "@/hooks/useAccount";
import { MarketsProvider } from "@/hooks/useMarkets";
import { NotificationsProvider } from "@/hooks/useNotifications";
import { OrdersProvider } from "@/hooks/useOrders";
import { PriceProvider } from "@/hooks/usePrice";

export default function Providers({ children }: { children: ReactNode }) {
	return (
		<AccountProvider>
			<OrdersProvider>
				<MarketsProvider>
					<NotificationsProvider>
						<PriceProvider>{children}</PriceProvider>
					</NotificationsProvider>
				</MarketsProvider>
			</OrdersProvider>
		</AccountProvider>
	);
}
