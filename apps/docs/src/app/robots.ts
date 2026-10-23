import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/site";

const robots = (): MetadataRoute.Robots => ({
	rules: { userAgent: "*", allow: "/" },
	sitemap: `${siteUrl}/sitemap.xml`,
});

export default robots;
