"use client";
import { type ButtonHTMLAttributes, useRef } from "react";
import { useScramble } from "@/hooks/useScramble";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
	children: string;
}

const Plus = () => (
	<svg aria-hidden="true" className="cta__plus" viewBox="0 0 12 12">
		<path d="M6 0v12M0 6h12" />
	</svg>
);

/**
 * The template's CTA: three lime blocks. On hover or focus the left plus square grows in, the
 * label slides right and the right square folds away (700 ms), and the label scrambles once.
 */
export default function Cta({ children, className = "", type = "button", ...rest }: Props) {
	const ref = useRef<HTMLButtonElement>(null);
	useScramble(ref, "once", children);
	return (
		<button className={`cta ${className}`} ref={ref} type={type} {...rest}>
			<span aria-hidden="true" className="cta__sq cta__sq--in">
				<Plus />
			</span>
			<span className="cta__label">
				<span className="sr-only">{children}</span>
				<span aria-hidden="true" data-scramble key={children}>
					{children}
				</span>
			</span>
			<span aria-hidden="true" className="cta__sq cta__sq--out">
				<Plus />
			</span>
		</button>
	);
}
