import { Callout } from "fumadocs-ui/components/callout";
import { CodeBlock, Pre } from "fumadocs-ui/components/codeblock";
import * as Tabs from "fumadocs-ui/components/tabs";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import type { ComponentProps } from "react";

const DocsCallout = (props: ComponentProps<typeof Callout>) => (
	<Callout {...props} className="docs-callout" />
);

const DocsPre = ({ ref: _ref, ...props }: ComponentProps<"pre">) => (
	<CodeBlock {...props}>
		<Pre>{props.children}</Pre>
	</CodeBlock>
);

export const getMDXComponents = (components?: MDXComponents) =>
	({
		...defaultMdxComponents,
		...Tabs,
		Callout: DocsCallout,
		pre: DocsPre,
		...components,
	}) satisfies MDXComponents;

declare global {
	type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
