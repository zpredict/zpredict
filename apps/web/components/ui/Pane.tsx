import type { HTMLAttributes } from "react";

interface Props extends HTMLAttributes<HTMLElement> {
	/** `surface`: graphite gradient (left pane); `media`: dark, holds video or streams. */
	variant?: "surface" | "media";
}

/** One rounded pane of the split panel. */
export default function Pane({ variant = "surface", className = "", ...rest }: Props) {
	return <section className={`pane pane--${variant} ${className}`} {...rest} />;
}
