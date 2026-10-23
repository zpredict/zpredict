/**
 * Self-only CSP for the docs pages. Scripts need the request's nonce ('strict-dynamic' lets
 * Next's nonced loader pull its own chunks); nothing loads from another origin. Inline
 * styles stay allowed because React renders `style` attributes (Fumadocs' sidebar and
 * TOC); they cannot run code. Dev adds what React's dev tooling needs.
 */
export const contentSecurityPolicy = (nonce: string, dev = false) =>
	[
		"default-src 'none'",
		`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data:",
		"font-src 'self'",
		`connect-src 'self'${dev ? " ws:" : ""}`,
		"manifest-src 'self'",
		"base-uri 'none'",
		"form-action 'none'",
		"frame-ancestors 'none'",
	].join("; ");
