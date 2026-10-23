// Fails if a test listed in REGRESSION.md no longer exists in the file it names.
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const rows = readFileSync(new URL("REGRESSION.md", root), "utf8")
	.split("\n")
	.filter((l) => /^\| (PR )?#\d+/.test(l));
const missing = rows.filter((row) => {
	const [, file, test] = row.split("|")[3].match(/`([^`]+)` `([^`]+)`/) ?? [];
	return !file || !readFileSync(new URL(file, root), "utf8").includes(test);
});
if (missing.length || !rows.length) {
	console.error(`REGRESSION.md: missing tests:\n${missing.join("\n")}`);
	process.exit(1);
}
console.log(`REGRESSION.md: ${rows.length} regression tests found`);
