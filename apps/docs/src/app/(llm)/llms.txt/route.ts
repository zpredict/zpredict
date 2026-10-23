import { canonical, GITHUB_URL, siteUrl } from "@/lib/site";
import { source } from "@/lib/source";

export const revalidate = false;

export const GET = () => {
	const pages = source
		.getPages()
		.map((p) => {
			const note = p.data.description?.trim() ? `: ${p.data.description.trim()}` : "";
			return `- [${p.data.title}](${canonical(`${p.url}.md`)})${note}`;
		})
		.join("\n");
	const body = [
		"# zPredict",
		"",
		"> Shielded prediction market on Zcash. Price public, participants private: orders are XOR-shared across three relayers and crossed inside 3-party MPC; collateral sits in a FROST 2-of-3 Ironwood escrow. Testnet demo; the docs say what is live and what is a mock.",
		"",
		"Links point at Markdown (`.md`). Drop the suffix for HTML.",
		"",
		"## Docs",
		"",
		pages,
		"",
		"## Optional",
		"",
		`- [Full documentation](${siteUrl}/llms-full.txt): every page in one Markdown file`,
		`- [GitHub](${GITHUB_URL}): source, DESIGN.md, PRIVACY.md`,
		"",
	].join("\n");
	return new Response(body, { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
};
