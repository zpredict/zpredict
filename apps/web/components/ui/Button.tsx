import type { ButtonHTMLAttributes } from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: "lime" | "ghost";
}

/** Square mono button: lime block (primary) or hairline outline (ghost). */
export default function Button({
	variant = "lime",
	className = "",
	type = "button",
	...rest
}: Props) {
	return <button className={`btn btn--${variant} ${className}`} type={type} {...rest} />;
}
