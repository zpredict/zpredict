"use client";
import Cta from "@/components/ui/Cta";
import { useStart } from "@/hooks/useStart";

/** "Get testnet ZEC" until this browser's account holds a balance, then "Trade now". */
export default function StartButton() {
	const { start, label } = useStart();
	return <Cta onClick={start}>{label}</Cta>;
}
