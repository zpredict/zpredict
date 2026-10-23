"use client";

import { useCopyButton } from "fumadocs-ui/utils/use-copy-button";

import { CheckIcon, CopyIcon } from "@/components/icons";

/** Copy or open this page as Markdown, from our own origin (no third-party AI links). */
export const PageActions = ({ markdownUrl }: { markdownUrl: string }) => {
	const [copied, onCopy] = useCopyButton(async () => {
		const res = await fetch(markdownUrl);
		if (!res.ok) throw new Error(`Markdown ${res.status}`);
		await navigator.clipboard.writeText(await res.text());
	});
	return (
		<div className="docs-actions not-prose">
			<button className="docs-btn" onClick={onCopy} type="button">
				{copied ? <CheckIcon /> : <CopyIcon />}
				{copied ? "Copied" : "Copy Markdown"}
			</button>
			<a className="docs-btn" href={markdownUrl}>
				View .md
			</a>
		</div>
	);
};
