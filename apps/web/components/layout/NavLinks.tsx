"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
	{ href: "/", label: "Markets" },
	{ href: "/trade/", label: "Relayer View" },
	{ href: "/threat-model/", label: "Threat model" },
] as const;

export default function NavLinks() {
	const path = usePathname();
	const active = (href: string) => path === href || path === href.slice(0, -1);
	return (
		<nav aria-label="Primary" className="navlinks">
			{NAV.map(({ href, label }) => (
				<Link
					aria-current={active(href) ? "page" : undefined}
					className={`pill${active(href) ? " is-active" : ""}`}
					href={href}
					key={href}
				>
					{label}
				</Link>
			))}
		</nav>
	);
}
