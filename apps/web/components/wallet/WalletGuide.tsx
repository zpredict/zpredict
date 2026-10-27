"use client";
import Link from "next/link";
import DepositInfo from "@/components/order-ticket/DepositInfo";
import WithdrawForm from "@/components/order-ticket/WithdrawForm";
import Amount from "@/components/ui/Amount";
import Button from "@/components/ui/Button";
import { useAccount } from "@/hooks/useAccount";
import KeyBackup from "./KeyBackup";

/**
 * "Use your own wallet": there is no connect-wallet for shielded Zcash, and none is needed.
 * The account is a key in this browser; a wallet only funds it (a ZIP 321 request) and
 * receives withdrawals.
 */
export default function WalletGuide() {
	const { tag, balance, refresh } = useAccount();
	return (
		<div className="wguide">
			<header className="wguide__head">
				<p className="eyebrow">Your wallet · testnet</p>
				<h1 className="wguide__title">Use your own wallet.</h1>
				<p className="wguide__lede">
					Your account is a key in this browser. Any shielded testnet wallet can fund it and receive
					withdrawals.
				</p>
				{tag && (
					<p className="dim">
						Balance: {balance === null ? "…" : <Amount halfTicks={balance} />}{" "}
						<Button onClick={refresh} variant="ghost">
							Refresh
						</Button>
					</p>
				)}
			</header>
			<ol className="wguide__steps">
				<li>
					<h2>1. Deposit</h2>
					<DepositInfo open />
				</li>
				<li>
					<h2>2. Bet</h2>
					<p className="dim">Once your deposit is credited, pick a market.</p>
					<Link className="btn btn--lime" href="/#markets">
						Pick a market
					</Link>
				</li>
				<li>
					<h2>3. Withdraw</h2>
					<p className="dim">To a fresh testnet unified address (Ironwood receiver).</p>
					<WithdrawForm />
				</li>
			</ol>
			<KeyBackup />
			<section aria-labelledby="compat-title" className="wguide__compat">
				<h2 id="compat-title">Which wallets work?</h2>
				<p className="dim">
					Any Zcash <strong>testnet</strong> wallet that reads ZIP 321 requests with memos and sends
					to Ironwood. Tested: <strong>zcash-devtool</strong> (<code>wallet pay --payment-uri</code>
					).
				</p>
			</section>
		</div>
	);
}
