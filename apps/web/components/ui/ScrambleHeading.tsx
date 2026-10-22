"use client";
import { useRef } from "react";
import { useScramble } from "@/hooks/useScramble";

interface Props {
	as?: "h1" | "h2" | "h3";
	/** One entry per visual line. */
	lines: readonly string[];
	className?: string;
	id?: string;
}

/** A heading that scrambles while hovered. Screen readers read the real text from aria-label. */
export default function ScrambleHeading({ as: Tag = "h2", lines, className = "", id }: Props) {
	const ref = useRef<HTMLHeadingElement>(null);
	useScramble(ref, "hover");
	return (
		<Tag aria-label={lines.join(" ")} className={`scr ${className}`} id={id} ref={ref}>
			{lines.map((l) => (
				<span aria-hidden="true" className="scr__line" data-scramble key={l}>
					{l}
				</span>
			))}
		</Tag>
	);
}
