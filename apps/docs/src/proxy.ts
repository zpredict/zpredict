import { isMarkdownPreferred, rewritePath } from "fumadocs-core/negotiation";
import { type NextRequest, NextResponse } from "next/server";

import { contentSecurityPolicy } from "@/lib/csp";

const { rewrite: rewriteLLM } = rewritePath("/docs{/*path}", "/llms.mdx/docs{/*path}");

/**
 * Agents that ask for Markdown get the page's .md; everyone else gets HTML under a
 * per-request CSP nonce, which Next puts on every script it renders.
 */
export const proxy = (request: NextRequest) => {
	const { pathname } = request.nextUrl;
	if (pathname.startsWith("/docs") && isMarkdownPreferred(request)) {
		const result = rewriteLLM(pathname);
		if (result) {
			return NextResponse.rewrite(new URL(result, request.nextUrl), {
				headers: { Vary: "Accept" },
			});
		}
	}

	const nonce = btoa(crypto.randomUUID());
	const csp = contentSecurityPolicy(nonce, process.env.NODE_ENV === "development");
	const headers = new Headers(request.headers);
	headers.set("Content-Security-Policy", csp);
	const response = NextResponse.next({ request: { headers } });
	response.headers.set("Content-Security-Policy", csp);
	return response;
};

export const config = {
	// Pages only: not static assets, the Markdown/llms routes, search or social cards.
	matcher: [
		{
			source:
				"/((?!_next/static|_next/image|api/|og/|llms|white/|.*\\.(?:png|ico|webp|webmanifest|txt|xml|md)$).*)",
			missing: [
				{ type: "header", key: "next-router-prefetch" },
				{ type: "header", key: "purpose", value: "prefetch" },
			],
		},
	],
};
