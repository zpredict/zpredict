import Link from "next/link";

import { DOCS_URL, LANDING_URL as SITE } from "@/lib/config";

/** Site footer: what zPredict is, where to read more. Only our own origins (privacy gate). */
export default function Footer() {
	return (
		<footer className="sitefoot">
			<div className="sitefoot__brand">
				<p className="sitefoot__name">zPredict</p>
				<p className="dim">Price public. Participants private.</p>
				<p className="dim">
					Zcash testnet demo for Zecathon 2026. Markets resolve from Zcash mainnet.
				</p>
			</div>
			<nav aria-label="Footer" className="sitefoot__cols">
				<div>
					<p className="sitefoot__head">Markets</p>
					<Link href="/#markets">All markets</Link>
					<Link href="/trade/">Trade</Link>
				</div>
				<div>
					<p className="sitefoot__head">Privacy</p>
					<Link href="/threat-model/">Threat model</Link>
					<a href={`${SITE}/#how`}>How it works</a>
					<a href={`${DOCS_URL}/docs/privacy`}>Privacy docs</a>
				</div>
				<div>
					<p className="sitefoot__head">zPredict</p>
					<a href={`${SITE}/`}>About</a>
					<a href={`${SITE}/pitch/`}>2-minute pitch</a>
					<a href={DOCS_URL}>Docs</a>
				</div>
			</nav>
			<p className="sitefoot__fine dim">
				No cookies, no analytics, no third-party requests. Not affiliated with Polymarket; mirrored
				markets show its public price for reference.
			</p>
		</footer>
	);
}
