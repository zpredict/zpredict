"use client";

import { useSearchContext } from "fumadocs-ui/contexts/search";

import { SearchIcon } from "@/components/icons";

/** Opens Fumadocs' search dialog, which queries /api/search on this server. */
export const SearchButton = () => {
	const { setOpenSearch, hotKey } = useSearchContext();
	return (
		<button
			aria-label="Search documentation"
			className="docs-search"
			data-search-full=""
			onClick={() => setOpenSearch(true)}
			type="button"
		>
			<SearchIcon />
			<span className="docs-search__label">Search</span>
			<span className="docs-search__keys">
				{hotKey.map((k) => (
					<kbd key={String(k.key)}>{k.display}</kbd>
				))}
			</span>
		</button>
	);
};
