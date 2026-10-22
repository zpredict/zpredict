import type { ReactNode } from "react";

interface Props {
	children: ReactNode;
	tone?: "default" | "mock" | "yes" | "no" | "you" | "live";
	size?: "md" | "sm";
	title?: string;
}

/** Hairline pill tag. */
export default function Badge({ children, tone = "default", size = "md", title }: Props) {
	return (
		<span className={`badge badge--${tone} badge--${size}`} title={title}>
			{children}
		</span>
	);
}
