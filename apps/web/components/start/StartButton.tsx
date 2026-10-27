"use client";
import { useRouter } from "next/navigation";
import AccountMenu from "@/components/account/AccountMenu";
import Cta from "@/components/ui/Cta";
import { useAccount } from "@/hooks/useAccount";
import { useStart } from "@/hooks/useStart";

/** No account yet: "Get testnet ZEC". With one: Deposit and the account menu, as on Polymarket. */
export default function StartButton() {
	const { tag } = useAccount();
	const { start, label } = useStart();
	const router = useRouter();
	if (!tag) return <Cta onClick={start}>{label}</Cta>;
	return (
		<>
			<Cta onClick={() => router.push("/deposit/")}>Deposit</Cta>
			<AccountMenu />
		</>
	);
}
