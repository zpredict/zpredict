"use client";
import { accountHex } from "@zpredict/sdk";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import CopyButton from "@/components/ui/CopyButton";
import { useAccount } from "@/hooks/useAccount";
import { DOCS_URL } from "@/lib/config";
import GeneratedAvatar from "./GeneratedAvatar";

const LINKS = [
	{ href: "/portfolio/", label: "Account & portfolio" },
	{ href: "/deposit/", label: "Deposit" },
	{ href: "/withdraw/", label: "Withdraw" },
	{ href: "/faucet/", label: "Get testnet ZEC" },
	{ href: "/wallet/#backup", label: "Back up or restore account key" },
	{ href: "/threat-model/", label: "Threat model" },
] as const;

/**
 * The account menu behind the header avatar: the public account id (never the tag), the
 * account pages, and Forget, which removes the account from this browser (the balance stays
 * reachable with the backed-up key).
 */
export default function AccountMenu() {
	const { tag, forget } = useAccount();
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (!open) return;
		const close = (e: MouseEvent | KeyboardEvent) => {
			if (
				e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)
			)
				setOpen(false);
		};
		document.addEventListener("mousedown", close);
		document.addEventListener("keydown", close);
		return () => {
			document.removeEventListener("mousedown", close);
			document.removeEventListener("keydown", close);
		};
	}, [open]);
	if (!tag) return null;
	const id = accountHex(tag);
	const leave = () => {
		if (
			!window.confirm(
				"Forget this account in this browser? Back up its key first, or the balance is lost.",
			)
		)
			return;
		forget();
		setOpen(false);
		router.push("/");
	};
	return (
		<div className="acct" ref={ref}>
			<button
				aria-expanded={open}
				aria-haspopup="menu"
				aria-label="Account menu"
				className="acct__avatar"
				onClick={() => setOpen((o) => !o)}
				type="button"
			>
				<GeneratedAvatar name={id} />
			</button>
			{open && (
				<div className="acct__menu" role="menu">
					<div className="acct__head">
						<GeneratedAvatar name={id} size={48} />
						<div>
							<p className="acct__name">Your account</p>
							<p className="acct__id">
								{id.slice(0, 6)}…{id.slice(-4)} <CopyButton label="Copy" text={id} />
							</p>
						</div>
					</div>
					<nav className="acct__links">
						{LINKS.map((l) => (
							<Link href={l.href} key={l.href} onClick={() => setOpen(false)} role="menuitem">
								{l.label}
							</Link>
						))}
						<a href={DOCS_URL} role="menuitem">
							Docs
						</a>
					</nav>
					<button className="acct__forget" onClick={leave} role="menuitem" type="button">
						Forget this account
					</button>
				</div>
			)}
		</div>
	);
}
