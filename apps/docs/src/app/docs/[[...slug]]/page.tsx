import { findNeighbour } from "fumadocs-core/page-tree";
import { createRelativeLink } from "fumadocs-ui/mdx";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DocsNav } from "@/components/docs-nav";
import { MenuIcon } from "@/components/icons";
import { getMDXComponents } from "@/components/mdx";
import { PageActions } from "@/components/page-actions";
import { canonical, SITE_NAME } from "@/lib/site";
import { ogImagePath, source } from "@/lib/source";

type Props = { params: Promise<{ slug?: string[] }> };

/**
 * Sidebar, article and table of contents, all server-rendered: the only client code on a
 * page is the search dialog, the code-block copy buttons and Copy Markdown. The mobile
 * menu is a <details>, so it needs no script either.
 */
const Page = async ({ params }: Props) => {
	const page = source.getPage((await params).slug);
	if (!page) notFound();
	const MDX = page.data.body;
	const tree = source.getPageTree();
	const { previous, next } = findNeighbour(tree, page.url);
	const toc = page.data.toc.filter((t) => t.depth <= 3);
	return (
		<div className="docs-shell">
			<aside className="docs-sidebar">
				<DocsNav current={page.url} tree={tree} />
			</aside>
			<main className="docs-main">
				<details className="docs-mobile-nav">
					<summary>
						<MenuIcon />
						<span>Menu</span>
					</summary>
					<DocsNav current={page.url} tree={tree} />
				</details>
				<header className="docs-page__head">
					<div className="docs-page__title-row">
						<h1 className="docs-page__title">{page.data.title}</h1>
						<PageActions markdownUrl={`${page.url}.md`} />
					</div>
					{page.data.description ? (
						<p className="docs-page__lead">{page.data.description}</p>
					) : null}
				</header>
				<article className="prose docs-prose">
					<MDX components={getMDXComponents({ a: createRelativeLink(source, page) })} />
				</article>
				<nav aria-label="Pages" className="docs-pager">
					{previous ? (
						<a href={previous.url}>
							<span>Previous</span>
							{previous.name}
						</a>
					) : (
						<span />
					)}
					{next ? (
						<a className="docs-pager__next" href={next.url}>
							<span>Next</span>
							{next.name}
						</a>
					) : null}
				</nav>
			</main>
			{toc.length > 0 ? (
				<nav aria-label="On this page" className="docs-toc">
					<p className="docs-nav-sep">On this page</p>
					{toc.map((t) => (
						<a data-depth={t.depth} href={t.url} key={t.url}>
							{t.title}
						</a>
					))}
				</nav>
			) : null}
		</div>
	);
};

export default Page;

export const generateStaticParams = () => source.generateParams();

export const generateMetadata = async ({ params }: Props): Promise<Metadata> => {
	const page = source.getPage((await params).slug);
	if (!page) notFound();
	const { title, description } = page.data;
	const url = canonical(page.url);
	const social = `${title} | ${SITE_NAME}`;
	const image = { url: ogImagePath(page), width: 1200, height: 630, alt: title };
	return {
		title,
		description,
		alternates: { canonical: url, types: { "text/markdown": `${url}.md` } },
		openGraph: {
			type: "article",
			siteName: SITE_NAME,
			url,
			title: social,
			description,
			images: [image],
		},
		twitter: { card: "summary_large_image", title: social, description, images: [image] },
	};
};
