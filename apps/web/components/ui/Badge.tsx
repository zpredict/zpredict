import type { ReactNode } from "react";

interface Props {
	children: ReactNode;
	tone?: "default" | "mock" | "yes" | "no" | "you" | "live";
	title?: string;
}

/** Square uppercase tag. */
export default function Badge({ children, tone = "default", title }: Props) {
	return (
		<span className={`badge badge--${tone}`} title={title}>
			{children}
		</span>
	);
}
