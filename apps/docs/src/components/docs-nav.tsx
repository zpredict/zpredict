import type * as PageTree from "fumadocs-core/page-tree";

/** The sidebar, server-rendered from meta.json's tree; `current` is the page's URL. */
export const DocsNav = ({ tree, current }: { tree: PageTree.Root; current: string }) => (
	<nav aria-label="Docs" className="docs-nav">
		{tree.children.map((node) =>
			node.type === "separator" ? (
				<p className="docs-nav-sep" key={`sep-${String(node.name)}`}>
					{node.name}
				</p>
			) : node.type === "page" ? (
				<a
					aria-current={node.url === current ? "page" : undefined}
					className="docs-nav-item"
					href={node.url}
					key={node.url}
				>
					{node.name}
				</a>
			) : null,
		)}
	</nav>
);
