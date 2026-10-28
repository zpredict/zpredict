import assert from "node:assert/strict";
import { test } from "node:test";
import { targets } from "./deploy-targets.mjs";

test("a push rebuilds only the images its files go into", () => {
	assert.deepEqual(targets(["apps/docs/content/docs/sdk.mdx"]), ["docs"]);
	assert.deepEqual(
		targets(["apps/relayer/src/chain.rs", "README.md"]),
		[],
		"relayers deploy by hand",
	);
	assert.deepEqual(targets(["packages/sdk/src/index.ts"]), ["web"]);
	assert.deepEqual(targets(["packages/brand/tokens.css"]), ["landing", "web", "docs"]);
	assert.deepEqual(targets(["deploy/production/faucet.compose.yaml"]), ["faucet"]);
	assert.deepEqual(targets(["Cargo.lock"]), ["faucet"]);
	assert.deepEqual(targets(["pnpm-lock.yaml"]), ["landing", "web", "docs"]);
	assert.deepEqual(targets(["apps/web/scripts/privacy.mjs"]), ["landing", "web"]);
});
