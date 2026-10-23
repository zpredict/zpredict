// Hourly rolling markets, made the way the real relayers make them
// (apps/relayer/src/markets/rolling.rs), pre-NU7 only: a window every 48 blocks, H = the next
// window start, trading closes 4 blocks before H, resolved 10 blocks after it.
//
// MOCK: N is random and new outcomes are unsigned (the mock holds no FROST share), which is
// what the hosted relayers show until the key ceremony. Two past windows are replayed from
// packages/settle/testdata/outcome-vectors.json: real FROST 2-of-3 signatures from a
// throwaway test DKG, so the browser's signature check runs against real data.
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const vectors = JSON.parse(
	readFileSync(
		new URL("../../../../packages/settle/testdata/outcome-vectors.json", import.meta.url),
		"utf8",
	),
);

/** The test DKG's group key, served at `GET /group-key`. */
export const GROUP_KEY = vectors.groupKey;

const BASE = 1_000_000;
const WINDOW = 48;
const CLOSE = 4;
const CONFIRMATIONS = 10;

function rolling(k, n) {
	const resolve = (k + 1) * WINDOW;
	return {
		id: BASE + k,
		question: `Will mainnet block ${resolve.toLocaleString("en-US")} contain ≥ ${n} shielded action${n === 1 ? "" : "s"}?`,
		plugin: "shielded-actions",
		params: { minActions: n },
		closeHeight: resolve - CLOSE,
		resolveHeight: resolve,
		status: "open",
		rolling: true,
	};
}

/** Resolved, signed history from the vectors. */
export const SIGNED = vectors.cases
	.filter((c) => c.valid)
	.map((c) => ({
		...rolling(c.market - BASE, 31),
		status: "resolved",
		outcome: c.outcome,
		blockHeight: c.height,
		blockHash: c.blockHash,
		outcomeSig: c.sig,
	}));

/** Adds the window's market at `height` and moves rolling markets along. */
export function roll(markets, height) {
	const k = Math.floor(height / WINDOW);
	if (!markets.some((m) => m.id === BASE + k)) {
		markets.push(rolling(k, 20 + Math.floor(Math.random() * 20)));
	}
	for (const m of markets.filter((x) => x.rolling)) {
		if (m.status === "open" && height >= m.closeHeight) m.status = "closed";
		if (m.status === "closed" && height >= m.resolveHeight + CONFIRMATIONS) {
			Object.assign(m, {
				status: "resolved",
				outcome: Math.random() < 0.5 ? "yes" : "no",
				blockHeight: m.resolveHeight,
				blockHash: `0000000000${randomBytes(27).toString("hex")}`,
			});
		}
	}
}
