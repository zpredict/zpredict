"use client";
import { usePrice } from "@/hooks/usePrice";
import { usd, zec } from "@/lib/format";
import ZecIcon from "./ZecIcon";

/** Why the dollar figure is only a reference on this demo. */
export const USD_NOTE =
	"At the mainnet ZEC/USD spot price (Coinbase, fetched by the relayers, never by your browser). Testnet ZEC has no value.";

/** "Ƶ 0.25 ZEC ≈ $309.34": an amount in half-ticks, in ZEC, with its USD value once the
 *  relayers have a price. `usd={false}` leaves the dollars out where space is tight. */
export default function Amount({
	halfTicks,
	usd: showUsd = true,
}: {
	halfTicks: bigint | number;
	usd?: boolean;
}) {
	const price = usePrice();
	return (
		<span className="amount num">
			<ZecIcon /> {zec(halfTicks)} ZEC
			{showUsd && price && (
				<span className="amount__usd" title={USD_NOTE}>
					{usd(halfTicks, price.zecUsd)}
				</span>
			)}
		</span>
	);
}
