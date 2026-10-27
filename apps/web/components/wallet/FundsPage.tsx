"use client";
import Link from "next/link";
import DepositInfo from "@/components/order-ticket/DepositInfo";
import WithdrawForm from "@/components/order-ticket/WithdrawForm";
import { useAccount } from "@/hooks/useAccount";

const COPY = {
	deposit: {
		title: "Deposit",
		lede: "Fund your account from any shielded testnet wallet, in one payment request.",
	},
	withdraw: {
		title: "Withdraw",
		lede: "Send your balance to your own shielded testnet wallet.",
	},
} as const;

/** /deposit and /withdraw: one job per page, linked from the header, account menu and account page. */
export default function FundsPage({ kind }: { kind: keyof typeof COPY }) {
	const { tag } = useAccount();
	const c = COPY[kind];
	return (
		<div className="wguide">
			<header className="wguide__head">
				<p className="eyebrow">Your account · testnet</p>
				<h1 className="wguide__title">{c.title}</h1>
				<p className="wguide__lede">{c.lede}</p>
			</header>
			{kind === "deposit" && <DepositInfo open />}
			{kind === "withdraw" &&
				(tag ? (
					<WithdrawForm open />
				) : (
					<p className="dim">
						No account in this browser. <Link href="/faucet/">Get testnet ZEC →</Link>
					</p>
				))}
			<p className="dim">
				<Link href="/portfolio/">← Your account</Link> ·{" "}
				<Link href="/wallet/">How deposits and withdrawals work</Link>
			</p>
		</div>
	);
}
