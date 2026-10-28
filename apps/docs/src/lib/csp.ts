/**
 * Google Analytics 4 (#226), production only: the loader and the beacon origins gtag.js
 * needs (Google's GA4 CSP guide). The docs and zpredict.site only; the app never loads it.
 */
export const GA_ID = "G-W949LN2MSJ";
const GA = {
	script: "https://www.googletagmanager.com",
	img: "https://www.google-analytics.com https://www.googletagmanager.com",
	connect:
		"https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com",
};

/**
 * CSP for the docs pages: self, plus GA4's origins. Scripts need the request's nonce
 * ('strict-dynamic' lets Next's nonced loader pull its own chunks and the nonced gtag.js
 * run); GA's host in script-src is the fallback for browsers without 'strict-dynamic'.
 * Inline styles stay allowed because React renders `style` attributes (Fumadocs' sidebar
 * and TOC); they cannot run code. Dev drops GA and adds what React's dev tooling needs.
 */
export const contentSecurityPolicy = (nonce: string, dev = false) =>
	[
		"default-src 'none'",
		`script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${dev ? "'unsafe-eval'" : GA.script}`,
		"style-src 'self' 'unsafe-inline'",
		`img-src 'self' data:${dev ? "" : ` ${GA.img}`}`,
		"font-src 'self'",
		`connect-src 'self' ${dev ? "ws:" : GA.connect}`,
		"manifest-src 'self'",
		"base-uri 'none'",
		"form-action 'none'",
		"frame-ancestors 'none'",
	].join("; ");
