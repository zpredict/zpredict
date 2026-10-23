"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { DOCS_URL, LANDING_URL } from "@/lib/config";
import { motionOk } from "@/lib/scramble";

const NAV = [
	{ href: "/", label: "Markets" },
	{ href: "/trade/", label: "Relayer View" },
	{ href: "/threat-model/", label: "Threat model" },
	{ href: DOCS_URL, label: "Docs" },
	{ href: LANDING_URL, label: "Landing" },
] as const;

const CLOSE_MS = 750;

/**
 * The Menu button and its top-sheet dialog. `showModal` makes the page inert and traps focus;
 * Escape and backdrop clicks slide the sheet up first, then close it, and focus returns to
 * the button.
 */
export default function Menu() {
	const dialog = useRef<HTMLDialogElement>(null);
	const [open, setOpen] = useState(false);
	const [closing, setClosing] = useState(false);
	const path = usePathname();
	const current = (href: string) => href === path || `${href}/` === path;

	const show = () => {
		dialog.current?.showModal();
		setOpen(true);
	};
	const hide = () => {
		const d = dialog.current;
		if (!d?.open || closing) return;
		setClosing(true);
		setTimeout(
			() => {
				d.close();
				setClosing(false);
			},
			motionOk() ? CLOSE_MS : 0,
		);
	};

	return (
		<>
			<button
				aria-expanded={open}
				aria-haspopup="dialog"
				className="menu-btn"
				onClick={show}
				type="button"
			>
				<span>Menu</span>
				<span aria-hidden="true" className="menu-btn__icon" />
			</button>
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click; Escape is the dialog's own cancel */}
			<dialog
				aria-label="Menu"
				className={`menu${closing ? " is-closing" : ""}`}
				onCancel={(e) => {
					e.preventDefault();
					hide();
				}}
				onClick={(e) => e.target === e.currentTarget && hide()}
				onClose={() => setOpen(false)}
				ref={dialog}
			>
				<div className="menu__shell">
					<button className="menu__close" onClick={hide} type="button">
						Close
						<span aria-hidden="true" className="menu__x" />
					</button>
					<nav aria-label="Primary" className="menu__nav">
						{NAV.map(({ href, label }) => (
							<span className="menu__row" key={href}>
								<Link
									aria-current={current(href) ? "page" : undefined}
									className="menu__link"
									href={href}
									onClick={hide}
								>
									{label}
								</Link>
							</span>
						))}
					</nav>
					<div className="menu__info">
						<p className="menu__label">zPredict / Shielded markets</p>
						<p>
							Bet on Zcash outcomes. No relayer, chain observer or counterparty learns who bet,
							which side, or how much.
						</p>
					</div>
					<div className="menu__info">
						<p className="menu__label">Stack</p>
						<p>Zcash · Ironwood · FROST 2-of-3 · Halo 2 · 3-party MPC · Rust</p>
					</div>
				</div>
			</dialog>
		</>
	);
}
