/**
 * Privacy Policy and Terms of Service: the one copy of this content (#123). The app links here.
 * Every statement must match PRIVACY.md and the code; change them together.
 */
export type Segment = string | { text: string; href: string };

export interface LegalSection {
	heading: string;
	paragraphs: Segment[][];
}

export interface LegalDoc {
	title: string;
	updated: string;
	summary: string;
	sections: LegalSection[];
}

const REPO = "https://github.com/zpredict/zpredict";
const privacyMd = { text: "PRIVACY.md", href: `${REPO}/blob/main/PRIVACY.md` };
const issues = { text: "GitHub issues", href: `${REPO}/issues` };
const issue = (n: number) => ({ text: `#${n}`, href: `${REPO}/issues/${n}` });

export const NOTE =
	"Plain-language notes for a hackathon demo. Not legal advice, and not drafted by a lawyer.";

export const privacy: LegalDoc = {
	title: "Privacy Policy",
	updated: "2026-10-28",
	summary:
		"The app collects no accounts, cookies or analytics; this site and the docs count page views with Google Analytics. Your account tag stays in your browser; each relayer holds only random shares. The hosted demo has one limit you should know: all three relayers run on one server.",
	sections: [
		{
			heading: "Who we are",
			paragraphs: [
				[
					"zPredict is an open-source hackathon project (Zecathon 2026), not a company. The hosted demo is zpredict.site, app.zpredict.site and three relayers at r0, r1 and r2.zpredict.site. Evidence for every statement here is in ",
					privacyMd,
					".",
				],
			],
		},
		{
			heading: "What we don't collect",
			paragraphs: [
				[
					"No accounts, names, emails or KYC. The app (app.zpredict.site) sets no cookies, has no analytics or trackers and makes no requests to third parties. Our web servers keep no access logs, and fonts and scripts are self-hosted.",
				],
			],
		},
		{
			heading: "Analytics on this site and the docs",
			paragraphs: [
				[
					"zpredict.site and docs.zpredict.site use Google Analytics 4 to count visits (",
					issue(226),
					"). Google learns which pages you view and when, your IP address, your browser and device, and the page that sent you, and sets its own cookies (_ga) on these two sites. Google processes this under its own privacy policy. Blocking googletagmanager.com or google-analytics.com in your browser turns it off; nothing else breaks.",
				],
				[
					"The app never loads it: app.zpredict.site makes no requests to Google or any other third party, and Google never sees your orders, positions, balances, deposits or account tag.",
				],
			],
		},
		{
			heading: "What stays in your browser",
			paragraphs: [
				[
					"The app keeps your account tag (the only key to your balance), your orders with their shares and read tokens, in your browser's localStorage. The tag is never sent anywhere whole.",
				],
				[
					"“Forget this account” (under Deposit) or clearing the site's data deletes them. Nobody, including us, can restore a lost tag, so a balance tied to it is lost too.",
				],
			],
		},
		{
			heading: "What each relayer receives and keeps",
			paragraphs: [
				[
					"Your browser splits every order into three random shares and sends one to each relayer. Each relayer keeps, in an event log on its own volume: its share of each order and fill, its share of each account's key and balance, and the read tokens. One share alone reveals nothing; all three together reveal everything.",
				],
				[
					"Each relayer also sees each deposit's amount, time and account id, and each withdrawal's amount, destination address and time (it needs them to pay). It does not learn whose withdrawal it is, except through request metadata and amount and timing (",
					issue(90),
					", ",
					issue(91),
					").",
				],
				[
					"Public to anyone: the market list, outcomes and their signatures, one clearing price per market per batch, and a digest (not the content) of each share a relayer received.",
				],
			],
		},
		{
			heading: "Who else can see what (demo limits)",
			paragraphs: [
				[
					"Cloudflare only answers DNS lookups for our names: it does not proxy the sites or relayers, so TLS ends on our server and Cloudflare sees neither your requests nor your IP address (",
					issue(88),
					", ",
					issue(89),
					").",
				],
				[
					"All three relayers run on one server, so its operator could read every share. The privacy model needs three independent operators.",
				],
				[
					"Your network provider sees that you connect to zpredict.site and when, not what you send. Tor hides your IP address.",
				],
			],
		},
		{
			heading: "Other services",
			paragraphs: [
				[
					"For mirrored markets the relayers fetch public market data from Polymarket on the server side; Polymarket sees the server's address, never yours. Your browser never contacts Polymarket: a Polymarket link loads only if you click it, without a referrer.",
				],
				[
					"The relayers read Zcash blocks from public lightwalletd servers (zec.rocks, testnet.zec.rocks). When you deposit, your own wallet's server sees your IP address.",
				],
			],
		},
		{
			heading: "How long data is kept",
			paragraphs: [
				[
					"Relayer event logs stay on the relayers' volumes while the demo runs; nothing expires automatically. Operator logs hold start-up lines and errors, never an order, share, account or address. This is a testnet demo: all of it may be wiped at any time.",
				],
				[
					"We can't look up or delete “your” records on request: we don't know which ones are yours.",
				],
			],
		},
		{
			heading: "Changes and contact",
			paragraphs: [
				[
					"Changes are made in the public repository and update the date above. Questions: ",
					issues,
					".",
				],
			],
		},
	],
};

export const terms: LegalDoc = {
	title: "Terms of Service",
	updated: "2026-10-23",
	summary:
		"A hackathon demo on Zcash testnet: no real money, no advice, no warranty. Follow your local laws.",
	sections: [
		{
			heading: "What this is",
			paragraphs: [
				[
					"zPredict is a demo built for Zecathon 2026. It runs on Zcash testnet: testnet ZEC has no monetary value, and no real-money markets are offered.",
				],
			],
		},
		{
			heading: "No advice",
			paragraphs: [
				[
					"Prices are what demo traders paid, not forecasts. Nothing here is investment, financial, legal or tax advice.",
				],
			],
		},
		{
			heading: "As is",
			paragraphs: [
				[
					"The service is provided as is, without warranty of any kind. It may be wrong, unavailable, lose data, or be reset or shut down at any time, and testnet deposits may be lost. To the extent the law allows, the contributors are not liable for any loss from using it.",
				],
			],
		},
		{
			heading: "Your responsibilities",
			paragraphs: [
				[
					"Follow the laws where you are. Don't use zPredict where prediction markets are prohibited. Keep your account tag: it can't be recovered. Don't try to disrupt the service or claim demo accounts in bulk; there is a fixed number of them.",
				],
			],
		},
		{
			heading: "Mirrored markets and affiliation",
			paragraphs: [
				[
					"Some markets mirror a Polymarket question and resolve the way Polymarket resolves it. Polymarket's price is shown for reference, with attribution. zPredict is not affiliated with or endorsed by Polymarket, the Zcash Foundation or the Electric Coin Company.",
				],
			],
		},
		{
			heading: "Open source",
			paragraphs: [
				[
					"The code is open source under the ",
					{ text: "MIT License", href: `${REPO}/blob/main/LICENSE` },
					", which has its own warranty disclaimer.",
				],
			],
		},
		{
			heading: "Changes and contact",
			paragraphs: [
				[
					"These terms may change with the repository; the date above updates. Questions: ",
					issues,
					".",
				],
			],
		},
	],
};
