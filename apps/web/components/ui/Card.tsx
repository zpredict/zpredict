import type { HTMLAttributes } from "react";

/** Dark gradient card with a hairline border. */
export default function Card({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
	return <div className={`card ${className}`} {...rest} />;
}
