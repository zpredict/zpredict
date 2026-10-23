import { GitHubIcon } from "@/components/icons";
import { SearchButton } from "@/components/search-button";
import { APP_URL, GITHUB_URL } from "@/lib/site";

/** The one header, server-rendered: brand, search, the app and the repo. */
export const SiteHeader = () => (
	<header className="docs-header">
		<div className="docs-header__body">
			<a className="docs-brand" href="/docs/introduction">
				{/* biome-ignore lint/performance/noImgElement: a 28 px brand mark; next/image adds nothing */}
				<img alt="" height={28} src="/white/android-chrome-192x192.png" width={28} />
				<span className="docs-brand__name">zPredict</span>
				<span className="docs-brand__tag">docs</span>
			</a>
			<div className="docs-header__actions">
				<SearchButton />
				<a className="docs-header__link" href={APP_URL}>
					App
				</a>
				<a aria-label="GitHub" className="docs-icon-btn" href={GITHUB_URL} rel="noreferrer">
					<GitHubIcon />
				</a>
			</div>
		</div>
	</header>
);
