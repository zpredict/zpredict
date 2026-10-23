import type { MetadataRoute } from "next";

import { canonical } from "@/lib/site";
import { source } from "@/lib/source";

const sitemap = (): MetadataRoute.Sitemap =>
	source.getPages().map((page) => ({
		url: canonical(page.url),
		changeFrequency: "weekly",
		priority: page.slugs.join("/") === "introduction" ? 0.9 : 0.7,
	}));

export default sitemap;
