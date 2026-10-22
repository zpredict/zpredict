import type { ButtonHTMLAttributes } from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: "white" | "ghost";
}

/** 46px pill button: white (primary) or ghost (hairline). */
export default function Button({
	variant = "white",
	className = "",
	type = "button",
	...rest
}: Props) {
	return <button className={`btn btn--${variant} ${className}`} type={type} {...rest} />;
}
