import type { HTMLAttributes } from "react";

/** Square near-black box with a hairline border. */
export default function Card({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
	return <div className={`card ${className}`} {...rest} />;
}
