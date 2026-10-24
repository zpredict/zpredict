import { zec } from "@/lib/format";
import ZecIcon from "./ZecIcon";

/** "Ƶ 0.25 ZEC": an amount in half-ticks, shown in ZEC only. */
export default function Amount({ halfTicks }: { halfTicks: bigint | number }) {
	return (
		<span className="amount num">
			<ZecIcon /> {zec(halfTicks)} ZEC
		</span>
	);
}
