import type { HTMLAttributes } from "react";

interface Props extends HTMLAttributes<HTMLElement> {
	/** `lime` and `paper` are light surfaces: the header turns dark over them. */
	variant?: "dark" | "lime" | "paper";
}

/** One square section of a page. */
export default function Pane({ variant = "dark", className = "", ...rest }: Props) {
	return (
		<section
			className={`pane pane--${variant} ${className}`}
			data-surface={variant === "dark" ? undefined : "light"}
			{...rest}
		/>
	);
}
