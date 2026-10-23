// Every internal link (and #hash) in content/docs resolves, and every link to a file in
// this repo on GitHub (`.../zpredict/zpredict/blob|tree/main/<path>`) names a path that
// exists here. Run: pnpm lint:links
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { type FileObject, printErrors, scanURLs, validateFiles } from "next-validate-link";

const CONTENT_DIR = path.join(process.cwd(), "content/docs");
const REPO_ROOT = path.resolve(process.cwd(), "../..");
const REPO_LINK = /https:\/\/github\.com\/zpredict\/zpredict\/(?:blob|tree)\/main\/([^)\s#"'>]+)/g;

const walk = async (dir: string): Promise<string[]> => {
	const files: string[] = [];
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const p = path.join(dir, entry.name);
		if (entry.isDirectory()) files.push(...(await walk(p)));
		else if (/\.mdx?$/.test(entry.name)) files.push(p);
	}
	return files;
};

const toSlugs = (absolutePath: string): string[] => {
	const rel = path.relative(CONTENT_DIR, absolutePath).replaceAll("\\", "/");
	const withoutExt = rel.replace(/\.mdx?$/, "");
	return withoutExt === "index" ? [] : withoutExt.split("/");
};

const getHashes = (content: string): string[] => {
	const hashes: string[] = [];
	const seen = new Map<string, number>();
	for (const match of content.matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)) {
		const text = match[1]
			.replace(/`([^`]+)`/g, "$1")
			.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
			.replace(/<\/?[^>]+>/g, "")
			.trim()
			.toLowerCase()
			.replace(/[^\p{L}\p{N}\s_-]/gu, "")
			.replace(/\s+/g, "-");
		if (!text) continue;
		const count = seen.get(text) ?? 0;
		seen.set(text, count + 1);
		hashes.push(count === 0 ? text : `${text}-${count}`);
	}
	return hashes;
};

const files: FileObject[] = await Promise.all(
	(await walk(CONTENT_DIR)).map(async (p) => {
		const slugs = toSlugs(p);
		return {
			path: p,
			content: await readFile(p, "utf8"),
			url: slugs.length === 0 ? "/docs" : `/docs/${slugs.join("/")}`,
			data: {},
		};
	}),
);

const scanned = await scanURLs({
	preset: "next",
	populate: {
		"docs/[[...slug]]": files.map((f) => ({
			value: { slug: toSlugs(f.path) },
			hashes: getHashes(f.content),
		})),
	},
});

const missing: string[] = [];
for (const f of files) {
	for (const [, p] of f.content.matchAll(REPO_LINK)) {
		if (!existsSync(path.join(REPO_ROOT, decodeURIComponent(p)))) {
			missing.push(`${path.relative(CONTENT_DIR, f.path)}: ${p}`);
		}
	}
}

printErrors(await validateFiles(files, { scanned, checkRelativePaths: "as-url" }), true);
if (missing.length) {
	console.error(
		`lint:links: ${missing.length} GitHub link(s) to missing paths\n${missing.join("\n")}`,
	);
	process.exit(1);
}
console.log(`lint:links: ${files.length} pages, internal and repo links resolve`);
