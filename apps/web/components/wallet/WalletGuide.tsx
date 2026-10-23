"use client";
import Link from "next/link";
import DepositInfo from "@/components/order-ticket/DepositInfo";
import WithdrawForm from "@/components/order-ticket/WithdrawForm";
import { useAccount } from "@/hooks/useAccount";
import { units } from "@/lib/format";
import KeyBackup from "./KeyBackup";

/**
 * "Use your own wallet": there is no connect-wallet for shielded Zcash, and none is needed.
 * The account is a key in this browser; a wallet only funds it (a ZIP 321 request) and
 * receives withdrawals.
 */
export default function WalletGuide() {
	const { tag, mock, balance } = useAccount();
	return (
		<div className="wguide">
			<header className="wguide__head">
				<p className="eyebrow">Your wallet · testnet</p>
				<h1 className="wguide__title">Use your own wallet.</h1>
				<p className="wguide__lede">
					No wallet connects to a website in shielded Zcash, and zPredict doesn&apos;t need one:
					your account is a key kept in this browser. Your wallet sends testnet ZEC in and receives
					it back out, in three steps.
				</p>
				{tag && (
					<p className="dim">
						{mock ? "This browser holds a judge account (mock credit). " : ""}
						Balance: {balance === null ? "…" : `${units(balance)} units`}
					</p>
				)}
			</header>
			<ol className="wguide__steps">
				<li>
					<h2>1. Deposit</h2>
					<p className="dim">
						Pay the request from a shielded testnet wallet: scan the QR code, open it in a wallet on
						this device, or copy it. No testnet ZEC? Get some from the{" "}
						<Link href="/faucet/" prefetch={false}>
							faucet
						</Link>
						.
					</p>
					<DepositInfo open />
				</li>
				<li>
					<h2>2. Bet</h2>
					<p className="dim">
						Once the deposit is credited, pick a market and send an order. It leaves this browser as
						three random shares, one per relayer.
					</p>
					<Link className="btn btn--lime" href="/#markets">
						Pick a market
					</Link>
				</li>
				<li>
					<h2>3. Withdraw</h2>
					<p className="dim">
						Paid from the escrow to a fresh testnet unified address with an Ironwood (Orchard)
						receiver. Transparent addresses are refused.
					</p>
					<WithdrawForm />
				</li>
			</ol>
			<KeyBackup />
			<section aria-labelledby="compat-title" className="wguide__compat">
				<h2 id="compat-title">Which wallets work?</h2>
				<p className="dim">
					You need a wallet that runs on Zcash <strong>testnet</strong>, can send to an Ironwood
					(Orchard) receiver with a memo, and reads ZIP 321 payment requests.
				</p>
				<ul>
					<li>
						<strong>zcash-devtool</strong> (<code>wallet pay --payment-uri</code>): tested. Our
						end-to-end scripts pay this exact kind of request with it and receive payouts to it, on
						a local regtest chain.
					</li>
					<li>
						Other wallets: not verified by us yet. If yours handles testnet, Ironwood and memos, it
						should work; tell us in the repository&apos;s issues either way.
					</li>
				</ul>
			</section>
		</div>
	);
}
