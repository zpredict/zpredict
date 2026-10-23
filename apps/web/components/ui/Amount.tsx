import { units, zec } from "@/lib/format";
import ZecIcon from "./ZecIcon";

/** "25.00 units · Ƶ 0.25 ZEC": collateral units with their ZEC value (1 unit = 0.01 ZEC). */
export default function Amount({ halfTicks }: { halfTicks: bigint | number }) {
	return (
		<span className="amount num">
			{units(halfTicks)} units{" "}
			<span className="amount__zec">
				· <ZecIcon /> {zec(halfTicks)} ZEC
			</span>
		</span>
	);
}
