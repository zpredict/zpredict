// Which Coolify resources a push must rebuild, from the files it changed. Every rebuild runs
// on the VPS next to the relayers, and a needless one can starve them of memory (the relayer
// 0 kill on Oct 28), so a docs-only push rebuilds the docs only.
// Usage: git diff --name-only A B | node scripts/deploy-targets.mjs   → names, one per line
import { readFileSync } from "node:fs";

const shared = [/^pnpm-lock\.yaml$/, /^package\.json$/, /^pnpm-workspace\.yaml$/, /^\.npmrc$/];

/** Resource name (as in Coolify) → paths its image is built from. */
export const RESOURCES = {
	landing: [
		/^apps\/landing\//,
		/^packages\/(brand|ascii)\//,
		/^deploy\/static\//,
		/^apps\/web\/scripts\/privacy/,
		...shared,
	],
	web: [/^apps\/web\//, /^packages\/(sdk|brand|ascii)\//, /^deploy\/static\//, ...shared],
	docs: [/^apps\/docs\//, /^packages\/brand\//, ...shared],
	faucet: [
		/^apps\/faucet\//,
		/^deploy\/production\/faucet\./,
		/^Cargo\.(toml|lock)$/,
		/^rust-toolchain/,
	],
};

/** The resources any of `files` belongs to, in `RESOURCES` order. */
export const targets = (files) =>
	Object.keys(RESOURCES).filter((r) => files.some((f) => RESOURCES[r].some((p) => p.test(f))));

if (import.meta.url === `file://${process.argv[1]}`) {
	const files = readFileSync(0, "utf8").split("\n").filter(Boolean);
	for (const t of targets(files)) console.log(t);
}
