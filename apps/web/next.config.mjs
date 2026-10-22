/** @type {import('next').NextConfig} */
export default {
	// Static export: the browser talks to the three relayers directly, no Next server in between.
	output: "export",
	trailingSlash: true,
	images: { unoptimized: true },
	devIndicators: false,
	// Inline the (small) stylesheet so first paint needs no second round trip; the CSP allows it by hash.
	experimental: { inlineCss: true },
};
