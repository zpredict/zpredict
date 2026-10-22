import type { ButtonHTMLAttributes } from "react";
import Arrow from "./Arrow";

/** The template's large white CTA: label block plus a square arrow block. */
export default function Cta({
	children,
	type = "button",
	className = "",
	...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
	return (
		<button className={`cta ${className}`} type={type} {...rest}>
			<span className="cta__label">{children}</span>
			<span className="cta__arrow">
				<Arrow />
			</span>
		</button>
	);
}
