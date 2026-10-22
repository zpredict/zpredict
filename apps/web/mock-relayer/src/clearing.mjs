// Faithful JS port of zpredict_core::clear (packages/core/src/lib.rs); encoding comes from @zpredict/sdk.
// The real relayers run this inside 3-party MPC; the mock runs it in the clear.

export const TICKS = 100;

/**
 * Cross YES against NO within one market's batch (mirrors `zpredict_core::clear`).
 * YES `p` and NO `q` cross when p + q >= 100, at the midpoint; costs in half-ticks.
 * Best prices first, ties by batch position, partial fills carry over.
 */
export function clear(batch) {
	const pick = (side) =>
		batch
			.map((_, i) => i)
			.filter((i) => batch[i].side === side && batch[i].size > 0)
			.sort((a, b) => batch[b].price - batch[a].price || a - b);
	const yes = pick(0);
	const no = pick(1);
	const left = batch.map((o) => o.size);
	const fills = [];
	let y = 0;
	let n = 0;
	while (y < yes.length && n < no.length) {
		const yi = yes[y];
		const ni = no[n];
		const p = batch[yi].price;
		const q = batch[ni].price;
		if (p + q < TICKS) break;
		const size = Math.min(left[yi], left[ni]);
		const yesCost = p + TICKS - q;
		fills.push({ yes: yi, no: ni, size, yesCost, noCost: 2 * TICKS - yesCost });
		left[yi] -= size;
		left[ni] -= size;
		if (left[yi] === 0) y++;
		if (left[ni] === 0) n++;
	}
	return fills;
}

/**
 * Port of `zpredict_core::fill_records`: one 10-byte record per batch slot,
 * `size u32 | total_cost u32 | side u8 | flags u8`, summed over every match; unfilled = zeros.
 */
export function fillRecords(batch, fills) {
	const size = batch.map(() => 0);
	const cost = batch.map(() => 0);
	for (const f of fills) {
		size[f.yes] += f.size;
		cost[f.yes] += f.size * f.yesCost;
		size[f.no] += f.size;
		cost[f.no] += f.size * f.noCost;
	}
	return batch.map((o, i) => {
		const r = new Uint8Array(10);
		if (size[i] > 0) {
			const v = new DataView(r.buffer);
			v.setUint32(0, size[i], true);
			v.setUint32(4, cost[i], true);
			r[8] = o.side;
			r[9] = 1;
		}
		return r;
	});
}
