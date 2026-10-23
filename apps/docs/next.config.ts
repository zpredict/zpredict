import { fileURLToPath } from "node:url";
import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";

const config: NextConfig = {
	// A standalone server: search, llms.txt and the .md routes are route handlers.
	output: "standalone",
	// Trace from the monorepo root so the standalone bundle carries its workspace deps.
	outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
	reactStrictMode: true,
	poweredByHeader: false,
	devIndicators: false,
	serverExternalPackages: ["@takumi-rs/core"],
	images: { unoptimized: true },
	// The same headers deploy/static/Caddyfile sets for the landing and the app; the CSP is
	// per request (src/proxy.ts).
	headers: async () => [
		{
			source: "/:path*",
			headers: [
				{ key: "Referrer-Policy", value: "no-referrer" },
				{ key: "X-Content-Type-Options", value: "nosniff" },
				{ key: "X-Frame-Options", value: "DENY" },
				{ key: "Cross-Origin-Opener-Policy", value: "same-origin" },
				{ key: "Cross-Origin-Resource-Policy", value: "same-origin" },
				{
					key: "Permissions-Policy",
					value:
						"accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=(), browsing-topics=()",
				},
				{ key: "Strict-Transport-Security", value: "max-age=31536000" },
			],
		},
	],
	rewrites: async () => [{ source: "/docs/:path*.md", destination: "/llms.mdx/docs/:path*" }],
	// Readers come for the docs; the root and /docs both land on the first page.
	redirects: async () => [
		{ source: "/", destination: "/docs/introduction", permanent: true },
		{ source: "/docs", destination: "/docs/introduction", permanent: true },
	],
};

export default createMDX()(config);
