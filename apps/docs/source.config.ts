import type { LLMsOptions } from "fumadocs-core/mdx-plugins/remark-llms";
import { metaSchema, pageSchema } from "fumadocs-core/source/schema";
import { defineConfig, defineDocs } from "fumadocs-mdx/config";

const llmsOptions: LLMsOptions = {
	// Keep Callout as a token so getLLMText can render it as a quote.
	mdxAsPlaceholder: ["Callout"],
};

export const docs = defineDocs({
	dir: "content/docs",
	docs: {
		schema: pageSchema,
		postprocess: { includeProcessedMarkdown: llmsOptions },
	},
	meta: { schema: metaSchema },
});

export default defineConfig({
	mdxOptions: {
		// Dark only (ASCII Studio); one theme, so no light/dark CSS variables.
		rehypeCodeOptions: { themes: { dark: "vesper" }, defaultColor: "dark" },
	},
});
