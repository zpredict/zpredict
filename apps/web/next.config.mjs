/** @type {import('next').NextConfig} */
export default {
	// Static export: the browser talks to the three relayers directly, no Next server in between.
	output: "export",
	trailingSlash: true,
	images: { unoptimized: true },
	devIndicators: false,
};
