import { docs } from "collections/server";
import { loader } from "fumadocs-core/source";

export const source = loader({ baseUrl: "/docs", source: docs.toFumadocsSource() });

export type Page = (typeof source)["$inferPage"];

/** The page's social card, rendered at build by app/og/docs/[...slug]. */
export const ogImagePath = (page: Page) => `/og/docs/${[...page.slugs, "image.webp"].join("/")}`;
