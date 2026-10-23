import { renderPlaceholder } from "fumadocs-core/mdx-plugins/remark-llms.runtime";

import { canonical, siteUrl } from "@/lib/site";
import type { Page } from "@/lib/source";

export const collapseBlankLines = (text: string) =>
	`${text
		.replace(/\r\n/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim()}\n`;

const renderCallout = ({
	attributes,
	children,
}: {
	attributes: Record<string, unknown>;
	children: string;
}) => {
	const type = typeof attributes.type === "string" && attributes.type ? attributes.type : "info";
	const body = children.trim();
	return body ? `> **${type}:** ${body}` : "";
};

/** Drops heading anchors and makes /docs links absolute, so the Markdown stands alone. */
export const polishLLMMarkdown = (markdown: string) =>
	markdown
		.replace(/^(#{1,6}\s.+?)\s*\[#[^\]]+\]\s*$/gm, "$1")
		.replace(
			/\]\((\/docs\/[^)#]+)(#[^)]*)?\)/g,
			(_m, path: string, hash?: string) => `](${siteUrl}${path}${hash ?? ""})`,
		);

export const getLLMText = async (page: Page) => {
	const processed = await page.data.getText("processed");
	const body = collapseBlankLines(
		polishLLMMarkdown(await renderPlaceholder(processed, { Callout: renderCallout })),
	);
	const description = page.data.description?.trim();
	const lead = description ? `${description}\n\n` : "";
	return collapseBlankLines(`# ${page.data.title} (${canonical(page.url)})\n\n${lead}${body}`);
};
