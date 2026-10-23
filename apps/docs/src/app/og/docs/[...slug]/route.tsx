import { notFound } from "next/navigation";

import { ogImage } from "@/components/og-image";
import { source } from "@/lib/source";

export const revalidate = false;

export const GET = async (_req: Request, { params }: { params: Promise<{ slug: string[] }> }) => {
	const page = source.getPage((await params).slug.slice(0, -1));
	if (!page) notFound();
	return ogImage(page.data.title, page.data.description);
};

export const generateStaticParams = () =>
	source.getPages().map((page) => ({ slug: [...page.slugs, "image.webp"] }));
